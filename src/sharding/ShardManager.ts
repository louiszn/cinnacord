import { Client } from "../Client.js";
import { Shard } from "./Shard.js";

import sleep from "../utils/sleep.js";

import { ReadyStates } from "../constants/client.js";

export interface ShardingOptions {
	maxShards: number;
	maxConcurrency: number;
}

export class ShardManager extends Map<number, Shard> {
	public constructor(
		public client: Client,
		public options: ShardingOptions,
	) {
		super();
	}

	public spawn(id: number) {
		if (this.has(id)) {
			throw new Error("Looks like you're trying to spawn a shard twice.");
		}

		const shard = new Shard(this, id);

		shard.on("ready", () => {
			for (const [_, shard] of this) {
				if (shard.readyState !== ReadyStates.Ready) {
					return;
				}
			}

			this.client.readyState = ReadyStates.Ready;
			this.debug("All shard is ready.");
			this.client.emit("ready", this.client);
		});

		shard.on("disconnect", () => {
			for (const [_, shard] of this) {
				if (shard.readyState !== ReadyStates.Disconnected) {
					return;
				}
			}

			this.client.readyState = ReadyStates.Disconnected;
			this.client.emit("disconnect", this.client);
		});

		this.set(id, shard);
		this.debug(`Created shard '${id}'.`);
		this.client.emit("shardCreate", shard);

		shard.connect();
	}

	private debug(...messages: string[]) {
		this.client.emit("debug", `[ShardManager] ${messages.join(" ")}`);
	}

	public async connect() {
		for (let id = 0; id < this.options.maxShards; id++) {
			this.spawn(id);

			if (id != this.options.maxShards - 1) {
				await sleep(5_500);
			}
		}
	}
}
