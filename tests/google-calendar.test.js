import test from "node:test";
import assert from "node:assert/strict";
import { GoogleBrowserOAuth } from "../server/google-browser-oauth.js";
import { calendarLines } from "../server/providers.js";

test( "Calendar hides titles beginning with double slashes before limiting visible entries", () => {
	const event = ( summary, day ) => ( { summary, start: { date: `2026-10-${String( day ).padStart( 2, "0" )}` } } );const lines = calendarLines( [
		event( "// Privat", 1 ),
		event( "   // Ebenfalls privat", 2 ),
		event( "Familie // Hinweis", 3 ),
		...Array.from( { length: 12 }, ( _, index ) => event( `Termin ${index + 1}`, index + 4 ) )
	] );

	assert.equal( lines.length, 12 );assert.equal( lines.some( line => line.includes( "Privat" ) || line.includes( "Ebenfalls privat" ) ), false );assert.equal( lines.some( line => line.includes( "Familie // Hinweis" ) ), true );assert.equal( lines.some( line => line.includes( "Termin 11" ) ), true );assert.equal( lines.some( line => line.includes( "Termin 12" ) ), false );
} );

test( "Calendar browser OAuth requests its own scope and stores its refresh token", async() => {
	let credentials = { clientId: "calendar.apps.googleusercontent.com", clientSecret: "private-client" };
	const store = {
		get secrets() {
			return { googlePhotos: credentials };
		},
		async updateSecrets( update ) {
			credentials = update( { googlePhotos: credentials } ).googlePhotos;
		}
	};const requests = [];const client = new GoogleBrowserOAuth( store, {
		scope:       "https://www.googleapis.com/auth/calendar.readonly",
		serviceName: "Google Calendar",
		fetchImpl:   async( url, options ) => {
			requests.push( { url, options } );return new Response( JSON.stringify( {
				access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.readonly"
			} ), { status: 200, headers: { "Content-Type": "application/json" } } );
		}
	} );const login = await client.startLogin( "http://127.0.0.1:3210/oauth/google/callback" );const params = new URL( login.authorizationUrl ).searchParams;

	assert.equal( params.get( "scope" ), "https://www.googleapis.com/auth/calendar.readonly" );assert.equal( params.get( "access_type" ), "offline" );assert.equal( params.get( "prompt" ), "consent" );assert.equal( params.get( "code_challenge_method" ), "S256" );await client.completeLogin( { state: params.get( "state" ), code: "private-code" } );assert.equal( credentials.refreshToken, "private-refresh" );assert.equal( ( await client.pollLogin() ).connected, true );assert.equal( requests[ 0 ].url, "https://oauth2.googleapis.com/token" );assert.equal( requests[ 0 ].options.body.get( "grant_type" ), "authorization_code" );assert.ok( requests[ 0 ].options.body.get( "code_verifier" ) );
} );

test( "Calendar browser OAuth rejects wrong state without contacting Google", async() => {
	const store = {
		secrets: { googlePhotos: { clientId: "calendar.apps.googleusercontent.com", clientSecret: "private-client" } },
		async updateSecrets() {}
	};let requests = 0;const client = new GoogleBrowserOAuth( store, {
		scope:     "https://www.googleapis.com/auth/calendar.readonly",
		fetchImpl: async() => {
			requests++;return new Response( "{}" );
		}
	} );await client.startLogin( "http://127.0.0.1:3210/oauth/google/callback" );await assert.rejects( client.completeLogin( { state: "wrong", code: "private-code" } ), /ungültig/ );assert.equal( requests, 0 );
} );
