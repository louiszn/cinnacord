import EventEmitter from "./utils/EventEmitter.js";

import { REST } from "./rest/REST.js";
import { ShardManager, ShardingOptions } from "./sharding/ShardManager.js";

import { ReadyStates } from "./constants/client.js";

import { User } from "./structures/User.js";
import { Guild } from "./structures/Guild.js";
import { Message } from "./structures/Message.js";
import { Shard } from "./sharding/Shard.js";

export interface ClientOptions {
	token: string;
	intents: number;
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

export interface ClientEvents {
	ready: [client: Client];
	messageCreate: [message: Message];
	guildAvailable: [guild: Guild];
	guildCreate: [guild: Guild];
	guildDelete: [guild: Guild];
	shardCreate: [shard: Shard];
	debug: [...args: any[]];
	disconnect: [client: Client];
	raw: [payload: { d: any; t: string; op: number; s: number | null }];
}

export class Client extends EventEmitter<ClientEvents> {
	public readyState = ReadyStates.Disconnected;

	public rest!: REST;
	public shards!: ShardManager;

	public users = new Map<string, User>();
	public guilds = new Map<string, Guild>();

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
			this.once("ready", () => resolve(this));
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
