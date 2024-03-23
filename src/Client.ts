import EventEmitter from "node:events";

import { REST } from "./rest/REST.js";
import { ShardManager } from "./sharding/ShardManager.js";

import { ReadyStates } from "./constants/client.js";

export interface ClientOptions {
	token: string;
	intents: number | bigint;
}

export class Client extends EventEmitter {
	public readyState = ReadyStates.Disconnected;

	public rest!: REST;
	public shards = new ShardManager(this);

	public constructor(public options: ClientOptions) {
		super();

		if (!this.options.token) {
			throw new Error("Missing client token!");
		}

		if (!this.options.intents) {
			throw new Error("Misisng client intents!");
		}

		this.rest = new REST(options.token);
	}

	public async connect() {
		await this.shards["connect"]();

		return await new Promise<this>((resolve) => {
			this.once("ready", resolve);
		});
	}

	public get latency() {
		let sum = 0;

		for (const [_, shard] of this.shards) {
			sum += shard.latency;
		}

		return sum / this.shards.size;
	}

	private debug(...messages: string[]) {
		this.emit("debug", `[Client] ${messages.join(" ")}`);
	}
}
