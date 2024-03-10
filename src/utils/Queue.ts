export class Entry<T> {
	private controller = new AbortController();
	private promise = new Promise((resolve) => {
		this.controller.signal.addEventListener("abort", resolve);
	});

	public constructor(
		public queue: Queue<T>,
		public value: T,
	) {}

	public async wait() {
		if (this.queue.length > 1) {
			return await this.promise;
		}
	}
}

export class Queue<T> extends Array<Entry<T>> {
	public add(value: T) {
		const entry = new Entry(this, value);
		this.push(entry);
		return entry;
	}

	public next() {
		this.shift();
		this[0]?.["controller"].abort();
	}

	public clear() {
		for (const entry of this) {
			entry["controller"].abort();
		}
		
		this.length = 0;
	}
}
