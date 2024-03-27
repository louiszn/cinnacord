import Base from "./Base.js";

import { Client } from "../Client.js";
import { User } from "./User.js";
import { Member } from "./Member.js";
import { Message } from "./Message.js";

import { ChannelTypes } from "../constants/channel.js";

export interface MessageCreateOptions {
	content?: string;
	embeds?: any[];
	allowedMentions?: any;
	messageReference?: any;
	components?: any[];
	stickerIds?: string[];
	// files: any[];
	// attachments?: any[];
	flags?: number;
}

export class BaseChannel extends Base {
	public id: string;
	public type: number;
	public guildId?: string;
	public position?: string;
	public permissionOverwrites?: any[];
	public name?: string | null;
	public topic?: string | null;
	public nsfw?: boolean;
	public lastMessageId?: string | null;
	public bitrate?: number;
	public userLimit?: number;
	public rateLimitPerUser?: number;
	public recipients?: Map<string, User>;
	public icon?: string | null;
	public ownerId?: string;
	public applicationId?: string;
	public managed?: boolean;
	public parentId?: string | null;
	public lastPinTimestamp?: number | null;
	public rtcRegion?: string | null;
	public videoQualityMode?: number;
	public messageCount?: number;
	public memberCount?: number;
	public threadMetadata?: any;
	public member?: Member;
	public defaultAutoArchiveDuration?: number;
	public flags?: number;
	public totalMessageSent?: number;
	public availableTags?: any[];
	public appliedTags?: string[];
	public defaultReactionEmoji?: any[];
	public defaultThreadRateLimitPerUser?: number;
	public defaultSortOrder?: number | null;
	public defaultForumLayout?: number;

	public constructor(client: Client, data: any) {
		super(client, data);

		this.id = data.id;

		this.type = data.type;

		this.guildId = data.guild_id;

		this.position = data.position;

		this.permissionOverwrites = data.permission_overwrites;

		this.name = data.name;

		this.topic = data.topic;

		this.nsfw = data.nsfw;

		this.lastMessageId = data.last_message_id;

		this.bitrate = data.bitrate;

		this.userLimit = data.user_limit;

		this.rateLimitPerUser = data.rate_limit_per_user;

		if (data.recipients) {
			this.recipients = new Map();

			for (const recipient of data.recipients) {
				const user = client.users.get(recipient.id) || new User(client, recipient);
				this.recipients.set(user.id, user);
			}
		}

		this.icon = data.icon;

		this.ownerId = data.owner_id;

		this.applicationId = data.application_id;

		this.managed = data.boolean;

		this.parentId = data.parent_id;

		this.lastPinTimestamp = data.last_pin_timestamp;

		this.rtcRegion = data.rtc_region;

		this.videoQualityMode = data.video_quality_mode;

		this.messageCount = data.message_count;

		this.memberCount = data.member_count;

		this.threadMetadata = data.thread_metadata;

		this.member = data.member ? new Member(client, data.member) : undefined;

		this.defaultAutoArchiveDuration = data.default_auto_archive_duration;

		this.flags = data.flags;

		this.totalMessageSent = data.total_message_sent;

		this.availableTags = data.available_tags;

		this.appliedTags = data.applied_tags;

		this.defaultReactionEmoji = data.default_reaction_emoji;

		this.defaultThreadRateLimitPerUser = data.default_thread_rate_limit_per_user;

		this.defaultSortOrder = data.default_sort_order;

		this.defaultForumLayout = data.default_forum_layout;
	}

	public isGuildText(): this is GuildTextChannel {
		return this.type === ChannelTypes.GuildText;
	}

	public isDM(): this is DMChannel {
		return this.type === ChannelTypes.DM;
	}

	public isGuildVoice(): this is GuildVoiceChannel {
		return this.type === ChannelTypes.GuildVoice;
	}

	public isGroupDM(): this is GroupDMChannel {
		return this.type === ChannelTypes.GroupDM;
	}

	public isGuildCategory(): this is GuildCategoryChannel {
		return this.type === ChannelTypes.GuildCategory;
	}

	public isGuildAnnouncement(): this is GuildAnnouncementChannel {
		return this.type === ChannelTypes.GuildAnnouncement;
	}

	public isAnnouncementThread(): this is AnnouncementThreadChannel {
		return this.type === ChannelTypes.AnnouncementThread;
	}

	public isPublicThread(): this is PublicThreadChannel {
		return this.type === ChannelTypes.PublicThread;
	}

	public isPrivateThread(): this is PrivateThreadChannel {
		return this.type === ChannelTypes.PrivateThread;
	}

	public isGuildStageVoice(): this is GuildStageVoiceChannel {
		return this.type === ChannelTypes.GuildStageVoice;
	}

	public isGuildDirectory(): this is GuildDirectoryChannel {
		return this.type === ChannelTypes.GuildDirectory;
	}

	public isGuildForum(): this is GuildForumChannel {
		return this.type === ChannelTypes.GuildForum;
	}

	public isGuildMedia(): this is GuildMediaChannel {
		return this.type === ChannelTypes.GuildMedia;
	}

	public async send(options: MessageCreateOptions) {
		const { client } = this;
		const { rest } = client;

		const payload: any = {};

		payload.content = options.content;
		payload.embeds = options.embeds;

		if (options.allowedMentions) {
			payload.allowed_mentions = {
				parse: options.allowedMentions.parse,
				roles: options.allowedMentions.roles,
				users: options.allowedMentions.users,
				replied_user: options.allowedMentions.repliedUser,
			};
		}

		if (options.messageReference) {
			payload.message_reference = {
				message_id: options.messageReference.messageId,
				channel_id: options.messageReference.channelId,
				guild_id: options.messageReference.guildId,
				fail_if_not_exists: options.messageReference.failIfNotExists,
			};
		}

		payload.components = options.components;
		payload.stickerIds = options.stickerIds;
		payload.flags = options.flags;

		return new Message(client, await rest.post(`/channels/${this.id}/messages`, payload));
	}
}

export class GuildTextChannel extends BaseChannel {
	public declare position: string;
	public declare permissionOverwrites: any[];
	public declare name: string;
	public declare topic: string | null;
	public declare nsfw: boolean;
	public declare lastMessageId: string | null;
	public declare rateLimitPerUser: number;
	public declare parentId: string | null;
	public declare lastPinTimestamp: number | null;
	public declare flags: number;
}

export class DMChannel extends BaseChannel {}

export class GuildVoiceChannel extends BaseChannel {}

export class GroupDMChannel extends BaseChannel {}

export class GuildCategoryChannel extends BaseChannel {}

export class GuildAnnouncementChannel extends BaseChannel {}

export class AnnouncementThreadChannel extends BaseChannel {}

export class PublicThreadChannel extends BaseChannel {}

export class PrivateThreadChannel extends BaseChannel {}

export class GuildStageVoiceChannel extends BaseChannel {}

export class GuildDirectoryChannel extends BaseChannel {}

export class GuildForumChannel extends BaseChannel {}

export class GuildMediaChannel extends BaseChannel {}

export type Channel =
	| GuildTextChannel
	| DMChannel
	| GuildVoiceChannel
	| GroupDMChannel
	| GuildCategoryChannel
	| GuildAnnouncementChannel
	| AnnouncementThreadChannel
	| PublicThreadChannel
	| PrivateThreadChannel
	| GuildStageVoiceChannel
	| GuildDirectoryChannel
	| GuildForumChannel
	| GuildMediaChannel;
