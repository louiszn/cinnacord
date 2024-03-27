import Base from "./Base.js";

import { Client } from "../Client.js";
import { Member } from "./Member.js";
import { Channel, BaseChannel } from "./Channel.js";

export class Guild extends Base {
	public id: string;
	public name: string;
	public icon: string;

	public members = new Map<string, Member>();
	public channels = new Map<string, Channel>();

	public constructor(client: Client, data: any) {
		super(client, data);

		this.id = data.id;
		this.name = data.name;
		this.icon = data.icon;

		data.members.forEach((m: any) => {
			this.members.set(m.user.id, new Member(client, m));
		});

		data.channels.forEach((c: any) => {
			this.channels.set(c.id, new BaseChannel(client, c));
		});
	}

	get shard() {
		const { shards } = this.client;
		return shards.get(Number(BigInt(this.id) >> 22n) % shards.options.maxShards)!;
	}
}
