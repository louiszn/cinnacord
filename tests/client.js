import { Client, GatewayIntents } from "../dist/index.js";

const config = {
	token: "",
};

const client = new Client({
	intents: GatewayIntents.Guilds | GatewayIntents.GuildMessages | GatewayIntents.MessageContent,
	token: config.token,
	ws: { compress: true },
	sharding: true,
});

client.on("debug", console.log);

client.on("raw", async ({ t, d }) => {
	if (t === "MESSAGE_CREATE") {
		if (d.author.bot) {
			return;
		}

		if (d.content === "!ping") {
			await client.rest.post(`/channels/${d.channel_id}/messages`, {
				content: `Pong! ${client.latency}ms!`,
			});
		}

		if (d.content === "!avatar") {
			const embed = {
				author: { name: data.author.username },
				image: {
					url: `https://cdn.discordapp.com/avatars/${d.author.id}/${d.author.avatar}.png?size=4096`,
				},
			};

			await client.rest.post(`/channels/${d.channel_id}/messages`, {
				embeds: [embed],
			});
		}
	}
});

await client.connect();
