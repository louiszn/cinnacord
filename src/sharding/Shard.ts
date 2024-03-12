import WebSocket from "ws";
import EventEmitter from "node:events";

import { ShardManager } from "./ShardManager.js";

import sleep from "../utils/sleep.js";
import { Queue } from "../utils/Queue.js";

import { CloseEventCodes, Opcodes } from "../constants/gateway.js";
import { ReadyStates } from "../constants/client.js";

const getGatewayRatelimiting = () => ({
	remaining: 110,
	resetAt: Date.now() + 60_000,
});

export class Shard extends EventEmitter {
	public ws!: WebSocket;
	public readyState = ReadyStates.Disconnected;

	#sequence: number | null = null;
	#sessionId: string | null = null;

	#lastHeartbeatSent = -1;
	#lastHeartbeatReceived = -1;
	#heartbeatInterval: NodeJS.Timer | null = null;

	#rateLimit = getGatewayRatelimiting();
	#sendQueue = new Queue<{ op: Opcodes; d: any }>();
	#lastIdentify = -1;

	public constructor(
		public manager: ShardManager,
		public id: number,
	) {
		super();
	}

	public get latency() {
		return this.#lastHeartbeatReceived - this.#lastHeartbeatSent;
	}

	public init() {
		if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
			throw new Error("Looks like you're trying to init a shard twice.");
		}

		this.readyState = ReadyStates.Connecting;

		this.ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

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
				this.debug(`Received heartbeat acknowledge in ${this.latency}ms.`);
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
				this.debug("Shard is ready.");
				break;
			}
		}
	}

	async #handleError(error: Error) {}

	async #handleClose(code: number) {
		switch (code) {
			case CloseEventCodes.AuthenticationFailed: {
				throw new Error("An invalid token was provided.");
			}
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

	async #resume() {}

	public async disconnect() {}

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

	protected debug(...messages: string[]) {
		this.manager.client.emit("debug", `[Shard: ${this.id}] ${messages.join(" ")}  `);
	}
}
