import WebSocket from "ws";
import EventEmitter from "node:events";

import { ShardManager } from "./ShardManager.js";

import sleep from "../utils/sleep.js";
import { Queue } from "../utils/Queue.js";

import { CloseEventCodes, GatewayIntents, Opcodes } from "../constants/gateway.js";
import { ReadyStates } from "../constants/client.js";

import CinnacordError from "../errors/CinnacordError.js";

import { Guild } from "../structures/Guild.js";
import { Member } from "../structures/Member.js";
import { Message } from "../structures/Message.js";

import type { Inflate } from "zlib-sync";
const zlib = await import("zlib-sync").then((pkg) => pkg.default).catch(() => null);

const getGatewayRatelimiting = () => ({
	remaining: 110,
	resetAt: Date.now() + 60_000,
});

export class Shard extends EventEmitter {
	public ws!: WebSocket;
	public readyState = ReadyStates.Disconnected;

	#sequence: number | null = null;
	#sessionId: string | null = null;
	#resumeURL: string | null = null;

	#lastHeartbeatSent = Infinity;
	#lastHeartbeatReceived = Infinity;
	#heartbeatInterval: NodeJS.Timeout | null = null;
	#connectTimeout: NodeJS.Timeout | null = null;

	#rateLimit = getGatewayRatelimiting();
	#sendQueue = new Queue<{ op: Opcodes; d: any }>();
	#lastIdentify = -1;

	// https://discord.com/developers/docs/topics/gateway#transport-compression
	// "However, each Gateway connection should use its own unique zlib context."
	#inflate: Inflate | null = null;
	#textDecoder = new TextDecoder();

	public constructor(
		public manager: ShardManager,
		public id: number,
	) {
		super();
	}

	public isConnecting() {
		return this.readyState === ReadyStates.Connecting;
	}

	public isReady() {
		return this.readyState === ReadyStates.Ready;
	}

	public isDisconnecting() {
		return this.readyState === ReadyStates.Disconnecting;
	}

	public isDisconnected() {
		return this.readyState === ReadyStates.Disconnected;
	}

	public get latency() {
		return this.#lastHeartbeatReceived - this.#lastHeartbeatSent;
	}

	public connect() {
		if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
			throw new Error("Looks like you're trying to connect a shard twice.");
		}

		this.readyState = ReadyStates.Connecting;

		const { version, compress, url } = this.manager.client.options.ws!;

		const params = new URLSearchParams({ v: `${version}`, encoding: "json" });

		if (compress && zlib) {
			params.append("compress", "zlib-stream");

			this.#inflate = new zlib.Inflate({
				chunkSize: 128 * 1024,
			});
		}

		const gatewayUrl = `${this.#resumeURL || url}?${params}`;

		this.ws = new WebSocket(gatewayUrl);

		this.ws.once("open", () => {
			this.debug("Websocket opened.");
			this.#rateLimit = getGatewayRatelimiting();
		});

		this.ws.on("message", this.#handleMessage.bind(this));
		this.ws.on("error", this.#handleError.bind(this));
		this.ws.on("close", this.#handleClose.bind(this));

		this.#connectTimeout = setTimeout(() => {
			if (!this.isReady()) {
				this.disconnect();
				throw new Error("Connection timed out.");
			}
		}, 15_000);
	}

	async #handleMessage(data: WebSocket.RawData) {
		const payload = this.#unpack(data);

		if (!payload) {
			return;
		}

		this.manager.client.emit("raw", payload);

		const { d, op } = payload;

		switch (op) {
			case Opcodes.Dispatch: {
				await this.#handleDispatch(payload);
				break;
			}

			case Opcodes.Hello: {
				await this.#identify();
				await sleep(Math.random() * d.heartbeat_interval);
				await this.#sendHeartbeat();

				this.#heartbeatInterval = setInterval(() => {
					this.#sendHeartbeat();
				}, d.heartbeat_interval);

				break;
			}

			case Opcodes.HearbeatACK: {
				this.#lastHeartbeatReceived = Date.now();
				break;
			}

			case Opcodes.InvalidSession: {
				if (d && this.#sessionId) {
					await this.#resume();
				} else {
					this.#sessionId = null;
					this.#resumeURL = null;
					await this.#identify();
				}

				break;
			}

			case Opcodes.Reconnect: {
				this.#closeConnection();
				this.connect();
				break;
			}

			case Opcodes.Resume: {
				this.emit("debug", "Successfully resumed the client.");
				break;
			}
		}
	}

	async #handleDispatch(payload: any) {
		const { t, s, d } = payload;
		const { client } = this.manager;

		this.#sequence = s;

		switch (t) {
			case "READY": {
				this.#sessionId = d.session_id;

				this.readyState = ReadyStates.Ready;
				this.debug("Ready.");

				this.emit("ready");

				if (this.#connectTimeout) {
					clearTimeout(this.#connectTimeout);
					this.#connectTimeout = null;
				}

				break;
			}

			case "GUILD_CREATE": {
				const guild = new Guild(client, d);

				client.guilds.set(d.id, guild);

				if (d.unavailable) {
					client.emit("guildCreate", guild);
				} else {
					client.emit("guildAvailable", guild);
				}

				d.members.forEach((m: any) => {
					guild.members.set(m.user.id, new Member(client, m));
				});

				await guild.shard.send(Opcodes.RequestGuildMembers, {
					guild_id: guild.id,
					query: "",
					limit: 0,
					presences: Boolean(client.options.intents & GatewayIntents.GuildPresences),
				});

				break;
			}

			case "GUILD_DELETE": {
				const guild = client.guilds.get(d.id)!;
				client.emit("guildDelete", guild);
				client.guilds.delete(d.id);
				break;
			}

			case "GUILD_MEMBERS_CHUNK": {
				const guild = client.guilds.get(d.guild_id);

				if (!guild) {
					return;
				}

				d.members.forEach((m: any) => {
					guild.members.set(m.user.id, new Member(client, m));
				});

				break;
			}

			case "MESSAGE_CREATE": {
				const message = new Message(client, d);
				client.emit("messageCreate", message);
				break;
			}

			case "MESSAGE_DELETE": {
				break;
			}

			case "MESSAGE_UPDATE": {
				break;
			}
		}
	}

	#handleError(error: Error) {
		this.emit("error", error);
	}

	#handleClose(code: number) {
		let error: Error | CinnacordError;
		let reconnect = true;

		switch (code) {
			default: {
				error = new Error("An unknow error occurred.");
				break;
			}

			case CloseEventCodes.UnknowOpcode: {
				error = new Error("An invalid opcode or payload was sent.");
				break;
			}

			case CloseEventCodes.DecodeError: {
				error = new Error("An invalid payload was sent.");
				break;
			}

			case CloseEventCodes.NotAuthenticated: {
				error = new Error("A payload was sent prior to identifying.");
				break;
			}

			case CloseEventCodes.AuthenticationFailed: {
				error = new Error("An invalid token was provided.");
				reconnect = false;
				break;
			}

			case CloseEventCodes.AlreadyAuthenticated: {
				error = new Error("More than one identify payload were sent.");
				break;
			}

			case CloseEventCodes.InvalidSeq: {
				error = new Error("Invalid sequence number.");
				this.#sequence = null;
				break;
			}

			case CloseEventCodes.RateLimited: {
				error = new Error("You are being ratelimited.");
				this.#rateLimit = getGatewayRatelimiting();
				this.#rateLimit.remaining = 0;
				break;
			}

			case CloseEventCodes.SessionTimedOut: {
				error = new Error("The session was timed out or invalid.");
				this.#sessionId = null;
				this.#resumeURL = null;
				break;
			}

			case CloseEventCodes.InvalidShard: {
				error = new Error("An invalid shard key was used.");
				reconnect = false;
				break;
			}

			case CloseEventCodes.ShardingRequired: {
				error = new Error("Sharding required.");
				reconnect = false;
				break;
			}

			case CloseEventCodes.InvalidAPIVersion: {
				error = new Error("An invalid API version was used.");
				reconnect = false;
				break;
			}

			case CloseEventCodes.InvalidIntents: {
				error = new Error("Invalid intents were provided.");
				reconnect = false;
				break;
			}

			case CloseEventCodes.DisallowedIntents: {
				error = new Error("Disallowed intents were provided.");
				reconnect = false;
				break;
			}
		}

		if (reconnect) {
			this.#closeConnection();
			this.connect();
		} else {
			this.disconnect();
			throw error;
		}
	}

	async #sendHeartbeat() {
		this.#lastHeartbeatSent = Date.now();
		await this.send(Opcodes.Hearbeat, this.#sequence);
	}

	async #identify() {
		const { maxShards } = this.manager.options;
		const { ws, sharding, token, intents } = this.manager.client.options;

		const payload: any = {
			token,
			intents,
			properties: {
				os: "linux",
				browser: "Cinnacord",
				device: "Cinnacord",
			},
		};

		if (ws!.compress && zlib) {
			payload.compress = true;
		}

		if (sharding && maxShards > 0) {
			payload.shard = [this.id, maxShards];
		}

		await this.send(Opcodes.Identify, payload);
	}

	async #resume() {
		await this.send(Opcodes.Resume, {
			token: this.manager.client.options.token,
			session_id: this.#sessionId,
			seq: this.#sequence,
		});
	}

	#reset() {
		this.#sequence = null;
		this.#sessionId = null;

		this.#lastHeartbeatSent = -1;
		this.#lastHeartbeatReceived = -1;

		if (this.#heartbeatInterval) {
			clearInterval(this.#heartbeatInterval);
			this.#heartbeatInterval = null;
		}

		this.#rateLimit = getGatewayRatelimiting();
		this.#sendQueue.clear();
		this.#lastIdentify = -1;
	}

	#unpack(data: WebSocket.Data) {
		const message = new Uint8Array(data as Buffer);

		if (!this.#inflate) {
			const pack = Buffer.from(message);
			return JSON.parse(pack.toString());
		}

		const { length } = message;

		const flush =
			length >= 4 &&
			message[length - 4] === 0x00 &&
			message[length - 3] === 0x00 &&
			message[length - 2] === 0xff &&
			message[length - 1] === 0xff;

		const { Z_SYNC_FLUSH, Z_NO_FLUSH } = zlib!;

		this.#inflate.push(Buffer.from(message), flush ? Z_SYNC_FLUSH : Z_NO_FLUSH);

		const { err, result } = this.#inflate;

		if (err) {
			this.emit("error", this.#inflate.msg || "");
			return null;
		}

		if (flush && result) {
			const pack = Buffer.from(result);
			return JSON.parse(this.#textDecoder.decode(pack));
		}

		return null;
	}

	#closeConnection() {
		if (!this.ws) {
			return;
		}

		if (this.#sessionId) {
			this.ws.close(4901);
		} else {
			this.ws.close(1000);
		}

		delete (this as any).ws;
	}

	disconnect() {
		this.readyState = ReadyStates.Disconnecting;

		this.ws.removeAllListeners();
		this.#closeConnection();
		this.#reset();

		this.readyState = ReadyStates.Disconnected;
	}

	public async send(op: Opcodes, d: any) {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket wasn't connected");
		}

		if (op === Opcodes.Identify) {
			const lastSent = Date.now() - this.#lastIdentify;

			if (lastSent <= 5_500) {
				await sleep(5_500 - lastSent);
			}

			this.#lastIdentify = Date.now();
		} else {
			const entry = this.#sendQueue.add({ op, d });

			await entry.wait();

			if (this.#rateLimit.resetAt - Date.now() <= 0) {
				this.#rateLimit = getGatewayRatelimiting();
			}

			if (this.#rateLimit.remaining <= 0) {
				const retryAfter = this.#rateLimit.resetAt - Date.now();

				this.debug(`You are being rate limited. Retry in ${retryAfter}ms...`);

				await sleep(retryAfter);

				this.#rateLimit = getGatewayRatelimiting();
			}

			this.#rateLimit.remaining--;
			this.#sendQueue.next();
		}

		this.ws.send(JSON.stringify({ op, d }));
	}

	private debug(...messages: string[]) {
		this.manager.client.emit("debug", `[Shard: ${this.id}] ${messages.join(" ")}  `);
	}
}
