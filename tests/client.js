import { Client, GatewayIntents } from "../dist/index.js";

const config = {
	token: "",
};

const client = new Client({
	intents:
		GatewayIntents.Guilds |
		GatewayIntents.GuildMessages |
		GatewayIntents.MessageContent |
		GatewayIntents.GuildMembers,
	token: config.token,
	ws: { compress: true },
	sharding: true,
});

client.on("debug", console.log);

client.on("messageCreate", async (message) => {
	if (message.author.bot || !message.guild) {
		return;
	}

	if (message.content === "!ping") {
		await message.channel.send({
			content: `Pong! ${client.latency}ms!`,
		});
	}

	if (message.content === "!avatar") {
		await message.channel.send({
			embeds: [
				{
					image: { url: message.author.displayAvatarURL() }
				}
			]
		});
	}
});

await client.connect();
