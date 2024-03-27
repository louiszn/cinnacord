import Base from "./Base.js";

import { Client } from "../Client.js";

export class User extends Base {
	public id: string;
	public username: string;
	public discriminator: string;
	public globalName: string | null;
	public avatar: string | null;
	public bot: boolean;
	public system: boolean;
	public banner: string | null;
	public accentColor: number | null;
	public flags: number;
	public publicFlags: number;
	public avatarDecoration: string | null;

	public constructor(client: Client, data: any) {
		super(client, data);

		this.id = data.id;
		this.username = data.username;
		this.discriminator = data.discriminator;
		this.globalName = data.global_name || null;
		this.avatar = data.avatar || null;
		this.bot = Boolean(data.bot);
		this.system = Boolean(data.system);
		this.banner = data.banner || null;
		this.accentColor = data.accent_color || null;
		this.flags = data.flags || 0;
		this.publicFlags = data.pulblic_flags || 0;
		this.avatarDecoration = data.avatar_decoration || null;
	}

	public get displayName() {
		return this.globalName || this.username;
	}

	public defaultAvatarURL() {
		const id = BigInt(this.id);
		const discriminator = Number(this.discriminator);

		const index = this.discriminator === "0" ? Number(id >> 22n) % 6 : discriminator % 5;

		return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
	}

	public avatarURL() {
		return this.avatar && `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png`;
	}

	public displayAvatarURL() {
		return this.avatarURL() ?? this.defaultAvatarURL();
	}
}
