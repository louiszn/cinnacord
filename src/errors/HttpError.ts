class HttpError extends Error {
	public constructor(code: number, message: string) {
		super(message);
		this.name = `${HttpError.name}(${code})`;
	}
}

export default HttpError;
