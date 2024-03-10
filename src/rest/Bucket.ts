import { Queue } from "../utils/Queue.js";

export interface RequestEntry {
	endpoint: `/${string}`;
	method: string;
	payload?: any;
}

class Bucket {
	public limit = -1;
	public remaining = -1;
	public resetAt = -1;
	public queue = new Queue<RequestEntry>();

	public constructor(public route: string) {}
}

export default Bucket;
