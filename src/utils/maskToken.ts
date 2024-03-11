const maskToken = (token: string) => {
	const lastDotIndex = token.lastIndexOf(".");
	return token.substring(0, lastDotIndex + 1) + "*".repeat(token.length - lastDotIndex - 1);
};

export default maskToken;
