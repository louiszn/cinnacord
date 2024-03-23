import { Client } from "../Client.js";
import { Shard } from "./Shard.js";

import sleep from "../utils/sleep.js";

import { ReadyStates } from "../constants/client.js";

export class ShardManager extends Map<number, Shard> {
	public gatewayBot: any;

	public constructor(public client: Client) {
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
			this.client.emit("disconnect");
		});

		this.set(id, shard);
		this.debug(`Created shard '${id}'.`);
		this.client.emit("shardCreate", shard);

		shard.connect();
	}

	private debug(...messages: string[]) {
		this.client.emit("debug", `[ShardManager] ${messages.join(" ")}`);
	}

	protected async connect() {
		this.gatewayBot = await this.client.rest.get("/gateway/bot");

		for (let i = 0; i < 1; i++) {
			this.spawn(i);

			if (i + 1 !== 1) {
				await sleep(5_500);
			}
		}
	}
}
