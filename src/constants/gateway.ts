/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-opcodes
 */
export enum Opcodes {
	Dispatch,
	Hearbeat,
	Identify,
	PresenceUpdate,
	VoiceStateUpdate,
	Resume = 6,
	Reconnect,
	RequestGuildMembers,
	InvalidSession,
	Hello,
	HearbeatACK,
}

/**
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes
 */
export enum CloseEventCodes {
	UnknowError = 4000,
	UnknowOpcode,
	DecodeError,
	NotAuthenticated,
	AuthenticationFailed,
	InvalidSeq = 4007,
	RateLimited,
	SessionTimedOut,
	InvalidShard,
	ShardingRequired,
	InvalidAPIVersion,
	InvalidIntents,
	DisallowedIntents,
}
