import { Queue } from "../utils/Queue.js";

export interface RequestEntry {
	endpoint: `/${string}`;
	method: string;
	payload?: any;
}

export class Bucket {
	public limit = -1;
	public remaining = -1;
	public resetAt = -1;
	public queue = new Queue<RequestEntry>();

	public constructor(public route: string) {}
}
