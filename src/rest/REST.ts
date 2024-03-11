import EventEmitter from "node:events";

import { Bucket, RequestEntry } from "./Bucket.js";

import HttpError from "../errors/HttpError.js";

import sleep from "../utils/sleep.js";
import pkg from "../utils/package.js";
import { Entry } from "../utils/Queue.js";

export const buckets = new Map<string, Bucket>();

export const userAgent = `DiscordBot (https://github.com/louiszn/cinnacord, ${pkg.version})`;

export class REST extends EventEmitter {
	public constructor(public token: string) {
		super();
	}

	public async get(endpoint: `/${string}`) {
		return await this.addRequest("GET", endpoint);
	}

	public async post(endpoint: `/${string}`, payload: any) {
		return await this.addRequest("POST", endpoint, payload);
	}

	public async put(endpoint: `/${string}`, payload: any) {
		return await this.addRequest("PUT", endpoint, payload);
	}

	public async delete(endpoint: `/${string}`) {
		return await this.addRequest("DELETE", endpoint);
	}

	protected async addRequest(method: string, endpoint: `/${string}`, payload?: any) {
		const route = `${method}:${REST.getRoute(endpoint)}`;

		let bucket = buckets.get(route);

		if (!bucket) {
			bucket = new Bucket(route);
			buckets.set(route, bucket);
		}

		const entry = bucket.queue.add({
			method,
			endpoint,
			payload,
		});

		return await this.makeRequest(bucket, entry);
	}

	protected async makeRequest(bucket: Bucket, entry: Entry<RequestEntry>): Promise<any> {
		await entry.wait();

		const { endpoint, method, payload } = entry.value;

		if (bucket.remaining < 0 && bucket.resetAt - Date.now() > 0) {
			const resetAfter = bucket.resetAt - Date.now();

			this.emit("rateLimit", {
				route: bucket.route,
				endpoint,
				method,
				resetAfter,
			});

			await sleep(resetAfter);
		}

		const res = await fetch(`https://discord.com/api/v10/${endpoint}`, {
			method,
			headers: {
				"User-Agent": userAgent,
				"Content-Type": "application/json",
				Authorization: `Bot ${this.token}`,
			},
			body: JSON.stringify(payload),
		});

		const { headers, status, statusText, ok } = res;

		const limit = headers.get("X-RateLimit-Limit")!;
		const remaining = headers.get("X-RateLimit-Remaining")!;
		const resetAfter = headers.get("X-RateLimit-Reset-After")!;

		bucket.limit = Number(limit);
		bucket.remaining = bucket.remaining === -1 ? Number(remaining) : bucket.remaining - 1;
		bucket.resetAt = Number(resetAfter) * 1_000 + Date.now();

		if (ok) {
			bucket.queue.next();
			return await res.json();
		} else if (res.status === 429) {
			return await this.makeRequest(bucket, entry);
		} else {
			throw new HttpError(status, statusText + ".");
		}
	}

	public static getRoute(endpoint: `/${string}`) {
		return endpoint
			.replaceAll(/\d{17,19}/g, ":id")
			.replace(/\/reactions\/(.*)/, "/reactions/:emoji")
			.replace(/\/webhooks\/:id\/[^/?]+/, "/webhooks/:id/:token");
	}
}
