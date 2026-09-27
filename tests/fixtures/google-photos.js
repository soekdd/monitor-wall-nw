import sharp from "sharp";
import assert from "node:assert/strict";
const json = ( value, status = 200 ) => Response.json( value, { status } );
export const png = await sharp( {
	create: {
		width: 2400, height: 1200, channels: 3, background: "white"
	}
} ).png()
	.toBuffer();

export function fakeGoogle() {
	const calls = [], mock = {
		ready: true, fail: false, pending: false, slowed: false, pages: false, now: 1800000000000
	};

	mock.fetchImpl = async( url, options = {} ) => {
		url = String( url ); calls.push( { url, options } );

		if ( url.endsWith( "/device/code" ) ) {
			return json( {
				device_code: "private-device-code", user_code: "SHOW-CODE", verification_url: "https://www.google.com/device", expires_in: 1800, interval: 5
			} );
		}

		if ( url.endsWith( "/token" ) ) {
			if ( mock.slowed ) {
				mock.slowed = false; return json( { error: "slow_down" }, 400 );
			}

			if ( mock.pending ) {
				return json( { error: "authorization_pending" }, 400 );
			}

			return json( {
				access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600
			} );
		}

		assert.equal( options.headers.Authorization, "Bearer private-access" );

		if ( mock.fail ) {
			return json( { error: { message: "Dienst nicht verfügbar" } }, 503 );
		}

		if ( url.includes( "/devices?" ) ) {
			return json( {
				id: "remote-device", settingsUri: "https://photos.google.com/device/remote-device", mediaSourcesSet: false
			} );
		}

		if ( url.includes( "/devices/" ) ) {
			if ( options.method === "DELETE" ) {
				return json( {} );
			}

			return json( {
				id: "remote-device", settingsUri: "https://photos.google.com/device/remote-device", mediaSourcesSet: mock.ready, mediaSources: [ { id: "album1", displayName: "Familie" } ], pollingConfig: { pollInterval: "30s" }
			} );
		}

		if ( url.includes( "/mediaItems" ) ) {
			const second = new URL( url ).searchParams.get( "pageToken" );
			return json( { mediaItems: [ { id: second ? "two" : "one", mediaFile: { mimeType: "image/png", baseUrl: `https://lh3.googleusercontent.com/${second ? "two" : "one"}` } }, { id: "video", mediaFile: { mimeType: "video/mp4", baseUrl: "https://lh3.googleusercontent.com/video" } } ], ...mock.pages && !second ? { nextPageToken: "page2" } : {} } );
		}

		if ( url.startsWith( "https://lh3.googleusercontent.com/" ) ) {
			return new Response( png, { headers: { "Content-Type": "image/png" } } );
		}

		throw new Error( `Unexpected request: ${url}` );
	};

	mock.calls = calls; mock.nowFn = () => mock.now;
	return mock;
}
