import sharp from "sharp";
import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp, rm, writeFile, readFile, readdir
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../server/store.js";
import { GooglePicker } from "../server/google-picker.js";
import { ApiConnections, apiStore } from "../server/api-connections.js";
import { defaults } from "../server/defaults.js";
import { configSchema } from "../server/schema.js";
import { createWallServer } from "../server/app.js";
import { fakePicker } from "./fixtures/google-picker.js";


async function fixture( t ) {
	const directory = await mkdtemp( path.join( os.tmpdir(), "wall-picker-" ) );t.after( () => rm( directory, { recursive: true, force: true } ) );const store = await new JsonStore( directory ).init();const scene = {
		id: "picked", apiId: "google-picker", title: "Urlaub", type: "google-picker", category: "Familie", sources: [ "/demo/alpine.svg" ], enabled: true, weight: 3, seasons: [], hours: [], scrollSeconds: 90
	};await store.update( { ...store.config, scenes: [ ...store.config.scenes, scene ] } );const google = fakePicker();const picker = new GooglePicker(
		apiStore( store, "google-picker" ), store, {
			fetchImpl: google.fetchImpl, now: google.nowFn, scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
		}
	);await picker.configure( { clientId: "test.apps.googleusercontent.com", clientSecret: "private-client" } );const login = await picker.startLogin( "http://127.0.0.1:3210/oauth/google/callback" );await picker.completeLogin( { state: picker.auth.state, code: "private-code" } );return {
		directory, store, scene, google, picker, login
	};
}

async function ready(
	picker, scene, google
) {
	await picker.start( scene.id );google.selected = true;google.now += 5001;assert.equal( ( await picker.poll( scene.id ) ).status, "ready" );
}

test( "legacy service options, credentials and Ambient bindings migrate once and survive restart", async t => {
	const directory = await mkdtemp( path.join( os.tmpdir(), "wall-migration-" ) );t.after( () => rm( directory, { recursive: true, force: true } ) );const config = defaults();config.scenes.push( {
		id: "cloud", title: "Cloud", type: "google-photos", category: "Familie", sources: [], enabled: true, weight: 3, seasons: [], hours: [], scrollSeconds: 90
	} );
	config.widgets.push( {
		...config.widgets.find( w => w.type === "weather" ), id: "weather-copy", title: "Wetter zweiter Monitor"
	} );
	await writeFile( path.join( directory, "settings.json" ), JSON.stringify( config ) );await writeFile( path.join( directory, "secrets.json" ), JSON.stringify( {
		adminToken:   "private-admin",
		mpd:          { password: "private-mpd" },
		calendar:     { refreshToken: "private-calendar" },
		googlePhotos: {
			clientId: "test.apps.googleusercontent.com", clientSecret: "private-client", refreshToken: "private-ambient", devices: { cloud: { id: "device" } }
		}
	} ) );
	const store = await new JsonStore( directory ).init();
	assert.equal( store.config.widgets.find( w => w.id === "weather" ).apiId, "api-weather" );assert.deepEqual( store.config.widgets.find( w => w.id === "weather" ).options, {} );assert.equal( store.config.apis.find( a => a.id === "api-weather" ).options.latitude, 51.05 );assert.equal( store.secrets.apis[ "api-mpd" ].password, "private-mpd" );assert.equal( store.secrets.mpd, undefined );assert.equal( store.secrets.googlePhotos, undefined );assert.equal( store.secrets.adminToken, undefined );assert.equal( store.config.scenes.at( -1 ).apiId, "google-ambient" );assert.equal( store.secrets.apis[ "google-ambient" ].devices.cloud.id, "device" );assert.equal( store.secrets.apis[ "google-picker" ].refreshToken, undefined );
	const restarted = await new JsonStore( directory ).init();assert.deepEqual( restarted.config, store.config );assert.deepEqual( restarted.secrets, store.secrets );
	assert.equal( store.config.apis.filter( a => a.type === "weather" ).length, 1 );assert.equal( store.config.widgets.at( -1 ).apiId, "api-weather" );
	const manager = new ApiConnections( restarted );assert.equal( manager.status()[ "google-ambient" ].connected, true );assert.equal( manager.status()[ "google-picker" ].connected, false );assert.equal( JSON.stringify( manager.status() ).includes( "private-" ), false );
} );
test( "API references reject unknown IDs and mismatched service types", async t => {
	const { store } = await fixture( t );const config = structuredClone( store.config );config.scenes.at( -1 ).apiId = "api-weather";assert.equal( configSchema.safeParse( config ).success, false );config.scenes.at( -1 ).apiId = "missing";assert.equal( configSchema.safeParse( config ).success, false );
} );
test( "removing unused API profiles persists across restart", async t => {
	const { store, directory } = await fixture( t );await store.update( { ...store.config, apis: store.config.apis.filter( a => a.type !== "google-ambient" ) } );assert.equal( ( await new JsonStore( directory ).init() ).config.apis.some( a => a.type === "google-ambient" ), false );
} );
test( "Picker OAuth requires a matching state and loopback; callback persists tokens and rejects replay", async t => {
	const { picker, google } = await fixture( t );const login = await picker.startLogin( "http://127.0.0.1:3210/oauth/google/callback" );
	const params = new URL( login.authorizationUrl ).searchParams;assert.equal( params.get( "code_challenge_method" ), "S256" );assert.equal( params.get( "redirect_uri" ), "http://127.0.0.1:3210/oauth/google/callback" );assert.equal( ( await picker.pollLogin() ).pending, true );
	const calls = google.pickerCalls.length;await assert.rejects( picker.completeLogin( { state: "wrong", code: "private-code" } ), /ungültig/ );assert.equal( google.pickerCalls.length, calls );
	await picker.completeLogin( { state: params.get( "state" ), code: "private-code" } );assert.equal( ( await picker.pollLogin() ).connected, true );
	await assert.rejects( picker.completeLogin( { state: params.get( "state" ), code: "private-code" } ), /ungültig/ );
	await assert.rejects( picker.startLogin( "http://evil.example/oauth/google/callback" ), /Rückkanal/ );
	const again = await picker.startLogin( "http://127.0.0.1:3210/oauth/google/callback" );await assert.rejects( picker.completeLogin( { state: new URL( again.authorizationUrl ).searchParams.get( "state" ), error: "access_denied" } ), /abgelehnt/ );await assert.rejects( picker.pollLogin(), /abgelehnt/ );
} );
test( "Picker imports multiple pages locally, skips video, keeps scope separate and survives expiry/restart", async t => {
	const {
		store, picker, scene, google, directory, login
	} = await fixture( t );assert.equal( new URL( login.authorizationUrl ).searchParams.get( "scope" ), "https://www.googleapis.com/auth/photospicker.mediaitems.readonly" );const call = google.pickerCalls.find( c => c.url.endsWith( "/token" ) );assert.equal( call.options.body.get( "grant_type" ), "authorization_code" );assert.ok( call.options.body.get( "code_verifier" ) );assert.equal( login.authorizationUrl.includes( "private-client" ), false );
	await picker.start( scene.id );const count = google.pickerCalls.length;await picker.poll( scene.id );const after = google.pickerCalls.length;await picker.poll( scene.id );assert.equal(
		google.pickerCalls.length, after, "Polling respects Google interval"
	);assert.ok( after > count );
	google.selected = true;google.now += 5001;await picker.poll( scene.id );await picker.beginImport( scene );await picker.jobs.get( scene.id ).promise;
	assert.equal( picker.jobs.get( scene.id ).status, "done" );assert.equal( store.config.scenes.at( -1 ).sources.length, 2 );assert.equal( picker.session( scene.id ), undefined );

	for ( const source of store.config.scenes.at( -1 ).sources ) {
		assert.match( source, /\.webp$/ );const metadata = await sharp( await readFile( path.join( directory, source ) ) ).metadata();assert.equal( metadata.format, "webp" );assert.equal( metadata.width, 1600 );assert.equal( metadata.height, 800 );
	}

	google.now += 2 * 3600000;const restarted = await new JsonStore( directory ).init();assert.deepEqual( restarted.config.scenes.at( -1 ).sources, store.config.scenes.at( -1 ).sources );assert.equal( JSON.stringify( picker.status() ).includes( "private-" ), false );
} );
test( "failed downloads preserve old scene and clean staged files; no token sent to arbitrary hosts", async t => {
	const {
		store, picker, scene, google, directory
	} = await fixture( t );await ready(
		picker, scene, google
	);google.failDownload = true;await picker.beginImport( scene );await picker.jobs.get( scene.id ).promise;assert.equal( picker.jobs.get( scene.id ).status, "error" );assert.deepEqual( store.config.scenes.at( -1 ).sources, [ "/demo/alpine.svg" ] );assert.deepEqual( await readdir( path.join( directory, "media" ) ), [] );
	google.failDownload = false;google.badHost = true;await picker.beginImport( scene );await picker.jobs.get( scene.id ).promise;assert.equal( picker.jobs.get( scene.id ).status, "error" );assert.equal( google.pickerCalls.some( c => c.url.startsWith( "https://evil.example" ) ), false );
} );
test( "corrupt photos are skipped without aborting the Picker import", async t => {
	const {
		store, picker, scene, google, directory
	} = await fixture( t );await ready(
		picker, scene, google
	);google.corruptDownload = true;await picker.beginImport( scene );await picker.jobs.get( scene.id ).promise;
	const job = picker.jobs.get( scene.id );assert.equal( job.status, "done" );assert.equal( job.completed, 2 );assert.equal( job.skipped, 1 );assert.equal( store.config.scenes.at( -1 ).sources.length, 1 );assert.equal( ( await readdir( path.join( directory, "media" ) ) ).length, 1 );
} );
test( "shutdown aborts an active download, removes temporary files and preserves the old stack", async t => {
	const {
		store, picker, scene, google, directory
	} = await fixture( t );await ready(
		picker, scene, google
	);const original = picker.fetch;let started;const entered = new Promise( resolve => {
		started = resolve;
	} );

	picker.fetch = async( url, options ) => {
		if ( String( url ).startsWith( "https://lh3.googleusercontent.com/" ) ) {
			started();return new Promise( ( _resolve, reject ) => {
				if ( options.signal.aborted ) {
					reject( options.signal.reason );
				} else {
					options.signal.addEventListener(
						"abort", () => reject( options.signal.reason ), { once: true }
					);
				}
			} );
		}

		return original( url, options );
	};

	await picker.beginImport( scene );await entered;await picker.close();assert.equal( picker.jobs.get( scene.id ).status, "error" );assert.deepEqual( store.config.scenes.at( -1 ).sources, [ "/demo/alpine.svg" ] );assert.deepEqual( await readdir( path.join( directory, "media" ) ), [] );
} );
test( "import commit retains concurrent settings edits and blocks changes to its API reference", async t => {
	const {
		store, picker, scene, google
	} = await fixture( t );await ready(
		picker, scene, google
	);
	const delegate = picker.fetch;let unblock, started;const gate = new Promise( resolve => {
								unblock = resolve;
							} ), entered = new Promise( resolve => {
								started = resolve;
							} );

	picker.fetch = async( url, options ) => {
		if ( String( url ).startsWith( "https://lh3.googleusercontent.com/" ) ) {
			started();await gate;
		}

		return delegate( url, options );
	};

	await picker.beginImport( scene );await entered;
	await store.update( { ...store.config, name: "During import" } );
	const manager = new ApiConnections( store );manager.clients.set( "google-picker", picker );const changed = structuredClone( store.config );changed.scenes = changed.scenes.filter( s => s.id !== scene.id );assert.throws( () => manager.assertConfigChange( changed ), /abwarten/ );
	unblock();await picker.jobs.get( scene.id ).promise;assert.equal( store.config.name, "During import" );assert.equal( store.config.scenes.at( -1 ).sources.length, 2 );
} );
test( "authenticated Picker API imports and renders durable files without exposing tokens", async t => {
	const {
		directory, store, scene, google
	} = await fixture( t );store.config.widgets.forEach( w => w.enabled = false );await store.update( store.config );
	const service = await createWallServer( {
		directory, host: "127.0.0.1", port: 0, dist: path.resolve( "dist" ), photosOptions: { fetchImpl: google.fetchImpl, now: google.nowFn }
	} );t.after( () => service.close() );const base = `http://127.0.0.1:${service.server.address().port}`;const headers = { Authorization: `Bearer ${service.password}`, "Content-Type": "application/json" };const req = (
		route, method = "POST", body
	) => fetch( base + route, {
		method, headers, body: body ? JSON.stringify( body ) : undefined
	} );
	assert.equal( ( await fetch( base + "/api/google-picker/scenes/picked/session", { method: "POST" } ) ).status, 401 );
	const login = await( await req( "/api/apis/google-picker/login" ) ).json();const parameters = new URL( login.authorizationUrl ).searchParams;assert.equal( parameters.get( "redirect_uri" ), `${base}/oauth/google/callback` );
	assert.equal( ( await fetch( `${base}/oauth/google/callback?state=wrong&code=fake` ) ).status, 400 );
	const callback = await fetch( `${base}/oauth/google/callback?state=${encodeURIComponent( parameters.get( "state" ) )}&code=fake` );assert.equal( callback.status, 200 );assert.match( callback.headers.get( "cache-control" ), /no-store/ );assert.match( await callback.text(), /Google Photos verbunden/ );
	assert.equal( ( await fetch( `${base}/oauth/google/callback?state=${encodeURIComponent( parameters.get( "state" ) )}&code=fake` ) ).status, 400 );
	assert.equal( ( await req( "/api/google-picker/scenes/picked/session" ) ).status, 200 );google.selected = true;google.now += 5001;
	assert.equal( ( await( await req( "/api/google-picker/scenes/picked/poll" ) ).json() ).status, "ready" );assert.equal( ( await req( "/api/google-picker/scenes/picked/import" ) ).status, 200 );
	const picker = service.connections.forScene( scene );await picker.jobs.get( scene.id ).promise;assert.equal( service.snapshot().state.revision, 1 );const state = await( await req( "/api/state", "GET" ) ).json();assert.equal( JSON.stringify( state ).includes( "private-" ), false );assert.equal( JSON.stringify( state ).includes( "googleusercontent.com/one" ), false );
	const source = state.config.scenes.at( -1 ).sources[ 0 ];assert.equal( ( await fetch( base + source ) ).status, 401 );assert.equal( ( await sharp( Buffer.from( await( await req( source, "GET" ) ).arrayBuffer() ) ).metadata() ).format, "webp" );assert.equal( ( await req(
		"/api/control", "POST", { action: "select", id: scene.id }
	) ).status, 200 );
	const w = state.config.widgets.find( w => w.type === "weather" );const shared = structuredClone( state.config );shared.widgets.push( {
		...w, id: "weather2", title: "Wetter zweiter Monitor", monitor: "m2"
	} );assert.equal( ( await req(
		"/api/config", "PUT", { config: shared, revision: 1 }
	) ).status, 200 );assert.equal( service.store.config.widgets.at( -1 ).apiId, w.apiId );
	const dangling = structuredClone( service.store.config );dangling.apis = dangling.apis.filter( a => a.id !== w.apiId );assert.equal( ( await req(
		"/api/config", "PUT", { config: dangling, revision: 2 }
	) ).status, 400 );
} );
