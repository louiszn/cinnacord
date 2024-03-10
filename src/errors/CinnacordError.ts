class CinnacordError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = CinnacordError.name;
	}
}

export default CinnacordError;
