import EventEmitter from "node:events";

import REST from "./rest/REST.js";
import ShardManager from "./sharding/ShardManager.js";

import { ReadyStates } from "./constants/client.js";

interface ClientOptions {
	token: string;
	intents: number | bigint;
}

class Client extends EventEmitter {
	public readyState = ReadyStates.Disconnected;

	public token = "";
	public rest!: REST;
	public shards = new ShardManager(this);

	public constructor(public options: ClientOptions) {
		super();
		this.rest = new REST(options.token);
	}

	public connect() {
		this.shards.connect();
	}
}

export default Client;
