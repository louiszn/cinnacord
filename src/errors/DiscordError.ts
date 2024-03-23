class DiscordError extends Error {
	public constructor(public code: number, message: string) {
		super(message);
		this.name = `${DiscordError.name}(${code})`;
	}
}

export default DiscordError;
