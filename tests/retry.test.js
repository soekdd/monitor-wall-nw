import test from "node:test";
import assert from "node:assert/strict";
import {
	retryDelay, transientNetworkError, STARTUP_RETRY_MS
} from "../server/retry.js";

test( "network failures retry quickly until the first success", () => {
	const unavailable = Object.assign( new Error( "connect failed" ), { code: "ENETUNREACH" } );

	assert.equal( transientNetworkError( unavailable ), true );
	assert.equal( retryDelay(
		false, 60000, unavailable
	), STARTUP_RETRY_MS );
	assert.equal( retryDelay(
		true, 60000, unavailable
	), 60000 );
} );

test( "HTTP and configuration errors retain the protective normal interval", () => {
	assert.equal( retryDelay(
		false, 60000, new Error( "HTTP 429" )
	), 60000 );
	assert.equal( retryDelay(
		false, 60000, new Error( "Zugangsdaten fehlen" )
	), 60000 );
} );

test( "fetch timeouts use the short startup interval", () => {
	const timeout = Object.assign( new Error( "request timed out" ), { name: "TimeoutError" } );

	assert.equal( retryDelay(
		false, 120000, timeout
	), STARTUP_RETRY_MS );
} );
