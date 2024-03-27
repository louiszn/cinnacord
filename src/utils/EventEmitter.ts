import BaseEventEmitter from "events";

interface EventEmitter<E extends Record<string | symbol, any> = any> {
	addListener<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	emit<K extends keyof E>(eventName: K, ...args: E[K]): boolean;
	listenerCount(eventName: keyof E): number;
	listeners(eventName: keyof E): Array<Function>;
	off<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	on<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	once<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	prependListener<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	prependOnceListener<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
	rawListeners(eventName: keyof E): Array<Function>;
	removeAllListeners(event?: keyof E): this;
	removeListener<K extends keyof E>(event: K, listener: (...args: E[K]) => void): this;
}

class EventEmitter<E extends Record<string | symbol, any> = any> extends BaseEventEmitter {}

export default EventEmitter;
