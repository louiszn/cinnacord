import { Client, GatewayIntents } from "../dist/index.js";

const config = {
	token: "",
};

const client = new Client({
	intents: GatewayIntents.Guilds | GatewayIntents.GuildMessages | GatewayIntents.MessageContent,
	token: config.token,
});

client.on("debug", console.log);

client.on("raw", async ({ data, name }) => {
	if (name === "MESSAGE_CREATE") {
		if (data.author.bot) {
			return;
		}

		if (data.content === "!ping") {
			await client.rest.post(`/channels/${data.channel_id}/messages`, {
				content: `Pong! ${client.latency}ms!`,
			});
		}

		if (data.content === "!avatar") {
			const embed = {
				author: { name: data.author.username },
				image: {
					url: `https://cdn.discordapp.com/avatars/${data.author.id}/${data.author.avatar}.png?size=4096`,
				},
			};

			await client.rest.post(`/channels/${data.channel_id}/messages`, {
				embeds: [embed],
			});
		}

		if (data.content === "!disconnect") {
			client.shards.get(0).disconnect();

			await client.rest.post(`/channels/${data.channel_id}/messages`, {
				content: "Websocket disconnected.",
			});
		}
	}
});

await client.connect();
