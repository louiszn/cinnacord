import Base from "./Base.js";

import { Client } from "../Client.js";
import { User } from "./User.js";
import { MessageCreateOptions } from "./Channel.js";

export interface MessageReplyOptions extends Omit<MessageCreateOptions, "messageReference"> {}

export class Message extends Base {
	public id: string;
	public channelId: string;
	public author: User;
	public content: string;
	// public timestamp: number;
	// public editedTimestamp: number | null;
	public guildId: string;

	public constructor(client: Client, data: any) {
		super(client, data);

		this.id = data.id;
		this.channelId = data.channel_id;
		this.author = client.users.get(data.author.id) || new User(client, data.author);
		this.content = data.content;
		this.guildId = data.guild_id;
	}

	get guild() {
		return this.client.guilds.get(this.guildId);
	}

	get member() {
		return this.guild?.members.get(this.author.id);
	}

	get channel() {
		return this.guild?.channels.get(this.channelId);
	}

	public async reply(options: MessageReplyOptions) {
		return await this.channel!.send(
			Object.assign(options, {
				messageReference: {
					messageId: this.id,
					channelId: this.channelId,
					failIfNotExists: false,
				},
			} satisfies MessageCreateOptions),
		);
	}
}
