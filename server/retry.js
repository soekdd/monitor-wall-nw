export const STARTUP_RETRY_MS = 5000;

const networkCodes = new Set( [
	"EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETDOWN", "ENETUNREACH", "ETIMEDOUT"
] );

export function transientNetworkError( error ) {
	const code = error?.code || error?.cause?.code;

	return [ "AbortError", "TimeoutError" ].includes( error?.name ) || networkCodes.has( code ) || error instanceof TypeError && /fetch failed/i.test( error.message );
}

export function retryDelay(
	hasSucceeded, normalMs, error
) {
	return !hasSucceeded && transientNetworkError( error ) ? Math.min( STARTUP_RETRY_MS, normalMs ) : normalMs;
}
