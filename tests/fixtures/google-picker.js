import assert from "node:assert/strict";
import { fakeGoogle } from "./google-photos.js";

export function fakePicker() {
	const google = fakeGoogle(), delegate = google.fetchImpl;
	google.selected = false;google.failDownload = false;google.badHost = false;google.pickerCalls = [];

	google.fetchImpl = async( url, options = {} ) => {
		url = String( url );google.pickerCalls.push( { url, options } );

		if ( url.startsWith( "https://photospicker.googleapis.com/" ) ) {
			assert.equal( options.headers.Authorization, "Bearer private-access" );
			const base = {
				id: "picked-session", pickerUri: "https://photos.google.com/picker/test", expireTime: new Date( google.now + 3600000 ).toISOString(), mediaItemsSet: google.selected, pollingConfig: { pollInterval: "2s", timeoutIn: "300s" }
			};

			if ( url.endsWith( "/sessions" ) && options.method === "POST" ) {
				return Response.json( base );
			}

			if ( url.includes( "/sessions/" ) ) {
				return Response.json( options.method === "DELETE" ? {} : base );
			}

			const second = new URL( url ).searchParams.get( "pageToken" );
			return Response.json( { mediaItems: [ { id: second ? "two" : "one", mediaFile: { mimeType: "image/png", baseUrl: google.badHost ? "https://evil.example/photo" : `https://lh3.googleusercontent.com/${second ? "two" : "one"}` } }, { id: "video", mediaFile: { mimeType: "video/mp4", baseUrl: "https://lh3.googleusercontent.com/video" } } ], ...!second ? { nextPageToken: "next" } : {} } );
		}

		if ( google.failDownload && url.startsWith( "https://lh3.googleusercontent.com/two" ) ) {
			return new Response( "fail", { status: 503 } );
		}

		return delegate( url, options );
	};

	return google;
}
