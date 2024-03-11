import { Client } from "../Client.js";
import { Shard } from "./Shard.js";

import sleep from "../utils/sleep.js";

import { ReadyStates } from "../constants/client.js";

export class ShardManager extends Map<number, Shard> {
	public constructor(public client: Client) {
		super();
	}

	public spawn(id: number) {
		if (this.has(id)) {
			throw new Error("Looks like you're trying to spawn a shard twice.");
		}

		const shard = new Shard(this, id);

		shard.on("ready", () => {
			shard["debug"]("Ready!");

			for (const [_, shard] of this.entries()) {
				if (shard.readyState !== ReadyStates.Ready) {
					return;
				}
			}

			this.client.readyState = ReadyStates.Ready;
			this.client.emit("ready");
		});

		shard.init();
		this.set(id, shard);

		this.debug(`Created shard '${id}'.`);
		this.client.emit("shardCreate", shard);
	}

	private debug(...messages: string[]) {
		this.client.emit("debug", `[ShardManager] ${messages.join(" ")}`);
	}

	public async connect() {
		for (let i = 0; i < 1; i++) {
			this.spawn(i);
			await sleep(5_500);
		}
	}
}
