import EventEmitter from "node:events";

import { REST } from "./rest/REST.js";
import { ShardManager, ShardingOptions } from "./sharding/ShardManager.js";

import { ReadyStates } from "./constants/client.js";

import { User } from "./structures/User.js";

export interface ClientOptions {
	token: string;
	intents: number | bigint;
	ws?: ClientWebsocketOptions;
	sharding?: ClientShardingOptions | boolean;
}

export interface ClientShardingOptions {
	maxShards: "auto" | number;
	maxConcurrency: "auto" | number;
}

export interface ClientWebsocketOptions {
	url: string;
	version: number;
	compress: boolean;
}

export class Client extends EventEmitter {
	public readyState = ReadyStates.Disconnected;

	public rest!: REST;
	public shards!: ShardManager;

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
		const { shards, session_start_limit, url } = await this.rest.get("/gateway/bot");

		const shardingOptions: ShardingOptions = {
			maxShards: 1,
			maxConcurrency: 1,
		};

		if (this.options.sharding) {
			if (typeof this.options.sharding === "boolean") {
				this.options.sharding = {
					maxShards: "auto",
					maxConcurrency: "auto",
				};
			}

			const { sharding } = this.options;

			if (sharding.maxShards === "auto") {
				shardingOptions.maxShards = shards;
			} else if (sharding.maxShards > 0) {
				shardingOptions.maxShards = Math.round(sharding.maxShards);
			}

			if (sharding.maxConcurrency === "auto") {
				shardingOptions.maxConcurrency = session_start_limit.max_concurrency;
			} else if (sharding.maxConcurrency > 0) {
				shardingOptions.maxShards = Math.round(sharding.maxConcurrency);
			}
		}

		this.shards = new ShardManager(this, shardingOptions);

		this.options.ws = Object.assign(
			{
				url,
				version: 10,
				compress: false,
			},
			this.options.ws,
		);

		await this.shards.connect();

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
