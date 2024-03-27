import Base from "./Base.js";

import { Client } from "../Client.js";
import { User } from "./User.js";

export class Member extends Base {
	public constructor(client: Client, data: any) {
		super(client, data);

		if (data.user) {
			client.users.set(data.user.id, new User(client, data.user));
		}
	}
}
