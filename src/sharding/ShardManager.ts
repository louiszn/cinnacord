import Client from "../Client.js";

import Shard from "./Shard.js";

import sleep from "../utils/sleep.js";

import { ReadyStates } from "../constants/client.js";

class ShardManager extends Map<number, Shard> {
	public constructor(public client: Client) {
		super();
	}

	public spawn(id: number) {
		if (this.has(id)) {
			throw new Error("Looks like you're trying to spawn a shard twice.");
		}

		const shard = new Shard(this, id);

		shard.on("ready", () => {
			for (const [_, shard] of this.entries()) {
				if (shard.readyState !== ReadyStates.Ready) {
					return;
				}
			}

			this.client.readyState = ReadyStates.Ready;
			this.client.emit("ready");
		});

		shard.init();
	}

	public async connect() {
		for (let i = 0; i < 1; i++) {
			this.spawn(i);
			await sleep(5_500);
		}
	}
}

export default ShardManager;
