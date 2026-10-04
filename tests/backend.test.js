import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp, readFile, rm, writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { defaults } from "../server/defaults.js";
import { JsonStore } from "../server/store.js";
import { configSchema } from "../server/schema.js";
import { eligibleScenes, pickNext } from "../server/scheduler.js";
import { createWallServer } from "../server/app.js";
import {
	loadWidget, mpd, parseSchoolXml
} from "../server/providers.js";
import { migrateApis } from "../server/api-migration.js";

async function fixture( t ) {
	const dir = await mkdtemp( path.join( os.tmpdir(), "wall-test-" ) );t.after( () => rm( dir, { recursive: true, force: true } ) );return dir;
}

test( "JSON updates are serialized and survive restart; invalid updates preserve disk", async t => {
	const dir = await fixture( t ), store = await new JsonStore( dir ).init();const a = { ...store.config, name: "A" }, b = { ...store.config, name: "B" };await Promise.all( [ store.update( a ), store.update( b ) ] );assert.equal( ( await new JsonStore( dir ).init() ).config.name, "B" );assert.throws( () => store.update( { ...b, intervalSeconds: 0 } ) );assert.equal( JSON.parse( await readFile( path.join( dir, "settings.json" ), "utf8" ) ).name, "B" );await store.saveSecrets( { password: "private" } );assert.equal( ( await new JsonStore( dir ).init() ).secrets.password, "private" );
} );
test( "access config is created with the initial password and custom passwords are loaded", async t => {
	const dir = await fixture( t ), store = await new JsonStore( dir ).init();assert.equal( store.access.password, "123" );assert.deepEqual( JSON.parse( await readFile( path.join( dir, "config.json" ), "utf8" ) ), { password: "123" } );
	await writeFile( path.join( dir, "config.json" ), JSON.stringify( { password: "family" } ) );assert.equal( ( await new JsonStore( dir ).init() ).access.password, "family" );await writeFile( path.join( dir, "config.json" ), JSON.stringify( { password: "" } ) );await assert.rejects( new JsonStore( dir ).init(), /password/ );
} );
test( "corrupt settings are reported and never overwritten", async t => {
	const dir = await fixture( t );const { writeFile } = await import( "node:fs/promises" );await writeFile( path.join( dir, "settings.json" ), "{broken" );await assert.rejects( new JsonStore( dir ).init(), /ungültig/ );assert.equal( await readFile( path.join( dir, "settings.json" ), "utf8" ), "{broken" );
} );
test( "last known good settings and secrets recover corrupt primary files", async t => {
	const dir = await fixture( t ), store = await new JsonStore( dir ).init();

	await store.update( { ...store.config, name: "First" } );
	await store.update( { ...store.config, name: "Second" } );
	assert.equal( JSON.parse( await readFile( path.join( dir, "settings.json.bak" ), "utf8" ) ).name, "First" );
	await store.saveSecrets( { token: "first" } );
	await store.saveSecrets( { token: "second" } );
	assert.deepEqual( JSON.parse( await readFile( path.join( dir, "secrets.json.bak" ), "utf8" ) ), { token: "first" } );

	await writeFile( path.join( dir, "settings.json" ), "{broken" );
	await writeFile( path.join( dir, "secrets.json" ), "{broken" );
	const recovered = await new JsonStore( dir ).init();

	assert.equal( recovered.config.name, "First" );
	assert.equal( recovered.secrets.token, "first" );
	assert.equal( JSON.parse( await readFile( path.join( dir, "settings.json" ), "utf8" ) ).name, "First" );
	assert.equal( JSON.parse( await readFile( path.join( dir, "secrets.json" ), "utf8" ) ).token, "first" );
} );
test( "a corrupt backup never replaces a corrupt primary file", async t => {
	const dir = await fixture( t );

	await writeFile( path.join( dir, "settings.json" ), "{primary-broken" );
	await writeFile( path.join( dir, "settings.json.bak" ), "{backup-broken" );
	await assert.rejects( new JsonStore( dir ).init(), /settings.json ist ungültig/ );
	assert.equal( await readFile( path.join( dir, "settings.json" ), "utf8" ), "{primary-broken" );
} );
test( "scheduler respects seasons, hours, disabled and future sources", () => {
	const c = defaults();c.scenes.forEach( s => s.enabled = false );c.scenes[ 0 ] = {
		...c.scenes[ 0 ], enabled: true, seasons: [ "winter" ], hours: [ 8 ]
	};assert.equal( eligibleScenes( c, new Date(
		2026, 0, 1, 8
	) ).length, 1 );assert.equal( pickNext(
		c, null, 1, new Date(
			2026, 6, 1, 8
		)
	), null );c.scenes[ 0 ].type = "google-photos";c.scenes[ 0 ].sources = [];assert.equal( eligibleScenes( c, new Date(
		2026, 0, 1, 8
	) ).length, 0 );
} );
test( "weighted shuffle avoids immediate repeat and deterministic selection wraps", () => {
	const c = defaults();assert.notEqual( pickNext(
		c, "alpine", 1, new Date(), () => 0
	), "alpine" );c.shuffle = false;assert.equal( pickNext( c, "welcome" ), "alpine" );assert.equal( pickNext(
		c, "alpine", -1
	), "welcome" );
} );
test( "config rejects duplicate IDs, orphan overlays and dangerous URLs", () => {
	const c = defaults();c.monitors[ 1 ].id = "m1";assert.equal( configSchema.safeParse( c ).success, false );const d = defaults();d.scenes[ 0 ].sources = [ "file:///etc/passwd" ];assert.equal( configSchema.safeParse( d ).success, false );const e = defaults();e.widgets[ 0 ].monitor = "nope";assert.equal( configSchema.safeParse( e ).success, false );
} );
test( "authenticated API controls, optimistic concurrency, uploads, secrets and events", async t => {
	const directory = await fixture( t );const initial = await new JsonStore( directory ).init();initial.config.widgets.forEach( w => w.enabled = false );await initial.update( initial.config );const service = await createWallServer( {
		directory, host: "127.0.0.1", port: 0, dist: path.resolve( "dist" )
	} );t.after( () => service.close() );const base = `http://127.0.0.1:${service.server.address().port}`;const req = (
		route, method = "GET", body
	) => fetch( base + route, {
		method, headers: { Authorization: `Bearer ${service.password}`, ...body ? { "Content-Type": "application/json" } : {} }, body: body ? JSON.stringify( body ) : undefined
	} );assert.equal( service.password, "123" );assert.equal( ( await fetch( base + "/api/state" ) ).status, 401 );const state = await( await req( "/api/state" ) ).json();assert.equal( JSON.stringify( state ).includes( service.password ), false );assert.equal( ( await req(
		"/api/control", "POST", { action: "pause" }
	) ).status, 200 );assert.equal( service.snapshot().state.paused, true );assert.equal( service.snapshot().state.sceneRevision, state.state.sceneRevision );assert.equal( ( await req(
		"/api/control", "POST", { action: "select", id: state.config.scenes[ 0 ].id }
	) ).status, 200 );assert.equal( service.snapshot().state.sceneRevision, state.state.sceneRevision + 1 );const activated = state.config.scenes[ 1 ];const saved = await req(
		"/api/config", "PUT", {
			config: { ...state.config, name: "Family" }, revision: state.state.revision, activateId: activated.id
		}
	);assert.equal( saved.status, 200 );const savedState = await saved.json();assert.equal( savedState.state.currentId, activated.id );assert.equal( savedState.state.sceneRevision, state.state.sceneRevision + 2 );const disabledConfig = structuredClone( savedState.config );disabledConfig.scenes.find( scene => scene.id === activated.id ).enabled = false;const disabledSave = await req(
		"/api/config", "PUT", {
			config: disabledConfig, revision: savedState.state.revision, activateId: activated.id
		}
	);assert.equal( disabledSave.status, 200 );assert.notEqual( ( await disabledSave.json() ).state.currentId, activated.id );assert.equal( ( await req(
		"/api/config", "PUT", { config: state.config, revision: 0 }
	) ).status, 409 );assert.equal( ( await req(
		"/api/control", "POST", { action: "select", id: "missing" }
	) ).status, 400 );assert.equal( ( await req(
		"/api/secrets/mpd", "PUT", { password: "test-secret" }
	) ).status, 200 );assert.equal( JSON.stringify( await( await req( "/api/state" ) ).json() ).includes( "test-secret" ), false );const form = new FormData();form.append(
		"files", new Blob( [ "<html>hello</html>" ], { type: "text/html" } ), "hello.html"
	);const upload = await fetch( base + "/api/upload", {
		method: "POST", headers: { Authorization: `Bearer ${service.password}` }, body: form
	} );assert.equal( upload.status, 200 );const { sources } = await upload.json();assert.equal( ( await fetch( base + sources[ 0 ] ) ).status, 401 );const media = await fetch( base + sources[ 0 ] + `?password=${service.password}` );assert.equal( await media.text(), "<html>hello</html>" );assert.match( media.headers.get( "content-security-policy" ), /sandbox/ );const abort = new AbortController();const stream = await fetch( base + `/api/events?password=${service.password}`, { signal: abort.signal } );const reader = stream.body.getReader();const chunk = await reader.read();assert.match( new TextDecoder().decode( chunk.value ), /Family/ );abort.abort();await reader.cancel().catch( () => {} );
} );
test( "MPD parser handles fragmented greeting and song values containing colons", async t => {
	const server = net.createServer( socket => {
		socket.write( "OK MP" );setTimeout( () => socket.write( "D 0.24.0\n" ), 5 );socket.on( "data", data => {
			if ( data.toString().includes( "currentsong" ) ) {
				socket.write( "state: play\nArtist: Test Artist\nTitle: A: " );setTimeout( () => socket.end( "song\nAlbum: Album\nOK\n" ), 5 );
			}
		} );
	} );await new Promise( resolve => server.listen(
		0, "127.0.0.1", resolve
	) );t.after( () => new Promise( resolve => server.close( resolve ) ) );const result = await mpd( { host: "127.0.0.1", port: server.address().port } );assert.deepEqual( result.lines, [ "A: song", "Test Artist · Album", "Wiedergabe" ] );
} );

test( "school widget groups multiple configured classes into one line each", async() => {
	const widget = { type: "school", apiId: "school-plan" };const apis = [ {
		id:      "school-plan",
		type:    "school",
		options: {
			class: [ "5a", "7b", "8c", "5a" ],
			rows:  [
				{
					date: "05.10.2026", class: "5a", lesson: "2", subject: "Mathe", text: "Frau Müller"
				},
				{
					date: "05.10.2026", class: "7b", lesson: "4", subject: "Deutsch", text: "entfällt"
				},
				{
					date: "05.10.2026", class: "5a", lesson: "3", subject: "Sport", text: "Turnhalle"
				}
			]
		}
	} ];

	assert.deepEqual( ( await loadWidget(
		widget, {}, apis
	) ).lines, [
		"5a: 05.10.2026 · 2 · Mathe · Frau Müller / 05.10.2026 · 3 · Sport · Turnhalle",
		"7b: 05.10.2026 · 4 · Deutsch · entfällt",
		"8c: keine Vertretungen"
	] );
} );

test( "school widget remains compatible with one configured class", async() => {
	const result = await loadWidget(
		{ type: "school", apiId: "school-plan" }, {}, [ {
			id:      "school-plan",
			type:    "school",
			options: {
				class: "5a",
				rows:  [ {
					class: "5a", lesson: "1", subject: "Englisch", text: "Raum 12"
				}, {
					class: "7b", lesson: "2", subject: "Musik"
				} ]
			}
		} ]
	);

	assert.deepEqual( result.lines, [ "5a: 1 · Englisch · Raum 12" ] );
} );

test( "school widget reads Stundenplan24 XML using separate basic credentials", async t => {
	const xml = `<?xml version="1.0"?><vp><haupt>
		<aktion><klasse>9a</klasse><stunde>2</stunde><fach>Ma&amp;the</fach><info><![CDATA[Raum <A>]]></info></aktion>
		<aktion><klasse>10b</klasse><stunde>4</stunde><fach>Deutsch</fach><info>entfällt</info></aktion>
	</haupt></vp>`;
	const server = http.createServer( ( req, res ) => {
		assert.equal( req.headers.authorization, `Basic ${Buffer.from( "student:shared-pass" ).toString( "base64" )}` );res.setHeader( "Content-Type", "application/xml" );res.end( xml );
	} );await new Promise( resolve => server.listen(
		0, "127.0.0.1", resolve
	) );t.after( () => new Promise( resolve => server.close( resolve ) ) );const api = {
		id:      "school-plan",
		type:    "school",
		options: { url: `http://127.0.0.1:${server.address().port}/VplanKl.xml`, class: [ "9a", "10b" ] }
	};const result = await loadWidget(
		{ type: "school", apiId: api.id },
		{ apis: { [ api.id ]: { username: "student", password: "shared-pass" } } },
		[ api ]
	);

	assert.deepEqual( result.lines, [ "9a: 2 · Ma&the · Raum <A>", "10b: 4 · Deutsch · entfällt" ] );
} );

test( "embedded school credentials migrate out of the URL", () => {
	const input = defaults();input.apis = [ {
		id: "school-plan", title: "School", type: "school", options: { url: "https://student%40school:p%40ss@example.test/VplanKl.xml", class: [ "9a" ] }
	} ];const school = input.widgets.find( widget => widget.type === "school" );school.apiId = "school-plan";school.options = {};const migrated = migrateApis( input, {} );const api = migrated.config.apis.find( item => item.id === "school-plan" );

	assert.equal( api.options.url, "https://example.test/VplanKl.xml" );assert.deepEqual( migrated.secrets.apis[ "school-plan" ], { username: "student@school", password: "p@ss" } );
} );

test( "Stundenplan24 XML parser rejects unrelated responses", () => {
	assert.throws( () => parseSchoolXml( "<html>Login</html>" ), /gültiges Stundenplan24-XML/ );
} );

test( "simultaneous configuration saves cannot overwrite each other", async t => {
	const directory = await fixture( t ), initial = await new JsonStore( directory ).init();initial.config.widgets.forEach( w => w.enabled = false );await initial.update( initial.config );const service = await createWallServer( {
		directory, host: "127.0.0.1", port: 0, dist: path.resolve( "dist" )
	} );t.after( () => service.close() );const base = `http://127.0.0.1:${service.server.address().port}`;const update = name => fetch( base + "/api/config", {
		method: "PUT", headers: { Authorization: `Bearer ${service.password}`, "Content-Type": "application/json" }, body: JSON.stringify( { config: { ...initial.config, name }, revision: 0 } )
	} );const responses = await Promise.all( [ update( "First" ), update( "Second" ) ] );assert.deepEqual( responses.map( r => r.status ).sort(), [ 200, 409 ] );assert.equal( service.snapshot().state.revision, 1 );
} );
