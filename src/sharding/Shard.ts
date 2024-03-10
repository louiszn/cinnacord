import WebSocket from "ws";
import EventEmitter from "node:events";

import ShardManager from "./ShardManager.js";

import sleep from "../utils/sleep.js";
import { Queue } from "../utils/Queue.js";

import { Opcodes } from "../constants/gateway.js";
import { ReadyStates } from "../constants/client.js";

const getGatewayRatelimiting = () => ({
	remaining: 110,
	resetAt: Date.now() + 60_000,
});

class Shard extends EventEmitter {
	public ws!: WebSocket;
	public readyState = ReadyStates.Disconnected;

	protected sequence: number | null = null;
	protected sessionId: string | null = null;

	protected lastHeartbeatSent = -1;
	protected lastHeartbeatReceived = -1;
	protected heartbeatInterval: NodeJS.Timer | null = null;

	private rateLimit = getGatewayRatelimiting();
	private sendQueue = new Queue<{ op: Opcodes; d: any }>();
	private lastIdentify = -1;

	public constructor(
		public manager: ShardManager,
		public id: number,
	) {
		super();
	}

	public get latency() {
		return this.lastHeartbeatReceived - this.lastHeartbeatSent;
	}

	public init() {
		if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
			throw new Error("Looks like you're trying to init a shard twice.");
		}

		this.readyState = ReadyStates.Connecting;

		this.ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

		this.ws.once("open", () => {
			this.debug("Websocket opened!");
			this.rateLimit = getGatewayRatelimiting();
		});

		this.ws.on("message", this.handleMessage.bind(this));
		this.ws.on("error", this.handleError.bind(this));
	}

	public async handleMessage(message: WebSocket.RawData) {
		const data = JSON.parse(message.toString());
		const { d, op } = data;

		switch (op) {
			case Opcodes.Dispatch: {
				await this.handleDispatch(data);
				break;
			}

			case Opcodes.Hello: {
				await this.identify();
				this.heartbeatInterval = setInterval(this.sendHeartbeat, d.heartbeat_interval);
				break;
			}

			case Opcodes.HearbeatACK: {
				this.lastHeartbeatSent = Date.now();
				break;
			}

			case Opcodes.InvalidSession: {
				break;
			}
		}
	}

	public async handleDispatch(data: any) {
		const { t, s, d } = data;

		this.sequence = s;

		switch (t) {
			case "READY": {
				this.sessionId = d.session_id;
				this.readyState = ReadyStates.Ready;
				this.emit("ready");
				break;
			}
		}
	}

	public handleError(error: Error) {}

	protected async sendHeartbeat() {
		this.lastHeartbeatSent = Date.now();
		await this.send(Opcodes.Hearbeat, this.sequence);
	}

	protected async identify() {
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

	protected disconnect() {}

	protected resume() {}

	protected async send(op: Opcodes, d: any) {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket wasn't connected");
		}

		if (op === Opcodes.Identify) {
			const lastSent = Date.now() - this.lastIdentify;

			if (lastSent <= 5_500) {
				await sleep(5_500 - lastSent);
			}

			this.lastIdentify = Date.now();
		} else {
			const entry = this.sendQueue.add({ op, d });

			await entry.wait();

			if (this.rateLimit.resetAt - Date.now() <= 0) {
				this.rateLimit = getGatewayRatelimiting();
			}

			if (this.rateLimit.remaining <= 0) {
				const retryAfter = this.rateLimit.resetAt - Date.now();
				this.debug(`You are being rate limited. Retry in ${retryAfter}ms...`);
				await sleep(retryAfter);
				this.rateLimit = getGatewayRatelimiting();
			}

			this.rateLimit.remaining--;
			this.sendQueue.next();
		}

		this.ws.send(JSON.stringify({ op, d }));
	}

	protected debug(...messages: string[]) {
		this.emit("debug", `Shard(${this.id}): ${messages.join(" ")}  `);
	}
}

export default Shard;
