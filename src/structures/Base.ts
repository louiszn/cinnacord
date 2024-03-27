import { Client } from "../Client.js";

class Base {
	public constructor(public client: Client, public data: any) {}

	public toJSON() {
		const json: any = {};

		for (const k of Object.keys(this)) {
			json[k] = this[k as keyof this];
		}

		return json;
	}
}

export default Base;
