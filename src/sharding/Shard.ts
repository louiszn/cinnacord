import WebSocket from "ws";
import EventEmitter from "node:events";

import { ShardManager } from "./ShardManager.js";

import sleep from "../utils/sleep.js";
import { Queue } from "../utils/Queue.js";

import { CloseEventCodes, Opcodes } from "../constants/gateway.js";
import { ReadyStates } from "../constants/client.js";
import CinnacordError from "../errors/CinnacordError.js";

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

	#lastHeartbeatSent = -1;
	#lastHeartbeatReceived = -1;
	#heartbeatInterval: NodeJS.Timeout | null = null;

	#rateLimit = getGatewayRatelimiting();
	#sendQueue = new Queue<{ op: Opcodes; d: any }>();
	#lastIdentify = -1;

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

		const gatewayUrl = `${this.manager.gatewayBot.url}?v=10&encoding=json`;

		if (this.#sessionId) {
			if (!this.#resumeURL) {
				this.emit(
					"warn",
					"Resume url is not currently present. Discord may disconnect you quicker.",
				);
			}

			this.ws = new WebSocket(this.#resumeURL || gatewayUrl);
		} else {
			this.ws = new WebSocket(gatewayUrl);
		}

		this.ws.once("open", () => {
			this.debug("Websocket opened.");
			this.#rateLimit = getGatewayRatelimiting();
		});

		this.ws.on("message", this.#handleMessage.bind(this));
		this.ws.on("error", this.#handleError.bind(this));
		this.ws.on("close", this.#handleClose.bind(this));
	}

	async #handleMessage(message: WebSocket.RawData) {
		const data = JSON.parse(message.toString());
		const { d, op } = data;

		switch (op) {
			case Opcodes.Dispatch: {
				await this.#handleDispatch(data);
				break;
			}

			case Opcodes.Hello: {
				await this.#identify();
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
				break;
			}
		}
	}

	async #handleDispatch(data: any) {
		const { t, s, d } = data;

		this.#sequence = s;

		switch (t) {
			case "READY": {
				this.#sessionId = d.session_id;

				this.readyState = ReadyStates.Ready;
				this.debug("Ready.");

				this.emit("ready");
				break;
			}
		}

		this.manager.client.emit("raw", { name: t, data: d });
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
			if (this.#sessionId) {
				if (this.ws.readyState === WebSocket.OPEN) {
					this.ws.close(4901);
				} else {
					this.ws.terminate();
				}
			} else {
				this.disconnect();
			}

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
		await this.send(Opcodes.Identify, {
			token: this.manager.client.options.token,
			intents: this.manager.client.options.intents,
			properties: {
				os: "linux",
				browser: "Cinnacord",
				device: "Cinnacord",
			},
		});
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

	disconnect() {
		this.readyState = ReadyStates.Disconnecting;

		this.#reset();

		this.ws.removeAllListeners();
		this.ws.close(1001);

		delete (this as any).ws;

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
