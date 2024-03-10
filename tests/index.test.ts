import { test } from "vitest";
import { Client } from "../src";

test("index", async () => {
	const client = new Client({
		token: "",
		intents: 1 << 0,
	});

	client.on("ready", () => {
		console.log("Ready!");
	});

	client.connect();

	await new Promise(() => {});
}, 60_000);
