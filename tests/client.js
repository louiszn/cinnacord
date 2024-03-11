import { Client } from "../dist/index.js";

const client = new Client({
	intents: 1 << 0,
	token: "A_VERY_REAL_TOKEN",
});

client.on("debug", console.log);

// client.on("ready", () => {
// 	console.log("Client is ready!");
// });

client.connect();
