import express from "express";
import multer from "multer";
import path from "node:path";
import {
	randomBytes, timingSafeEqual, randomUUID
} from "node:crypto";
import { Readable } from "node:stream";
import { networkInterfaces } from "node:os";
import { JsonStore } from "./store.js";
import { pickNext, eligibleScenes } from "./scheduler.js";
import { loadWidget } from "./providers.js";
import { ApiConnections } from "./api-connections.js";

export async function createWallServer( {
	directory, port = 3210, host = "0.0.0.0", frontend, dist, displays = () => [], onDisplays = () => {}, photosOptions = {}, googleCredentialsDirectory, googleCredentialsFile, googlePickerCredentialsFile
} ) {
	const store = await new JsonStore( directory ).init();

	if ( !store.secrets.adminToken ) {
		await store.saveSecrets( { ...store.secrets, adminToken: randomBytes( 24 ).toString( "hex" ) } );
	}

	const token = store.secrets.adminToken, app = express(), clients = new Set(), results = {}, pending = new Set(), lastPoll = new Map();
	const connections = new ApiConnections(
		store, photosOptions, committed => {
			if ( committed ) {
				state.revision++;
			}

			reconcilePlayback();broadcast();
		}
	);
	const ambientApi = store.config.apis.find( a => a.type === "google-ambient" );
	const photos = ambientApi ? connections.client( ambientApi.id ) : null;
	await photos?.loadCredentials( googleCredentialsDirectory, googleCredentialsFile );

	for ( const api of store.config.apis.filter( a => a.type === "google-picker" ) ) {
		if ( !connections.client( api.id ).status().configured ) {
			await connections.client( api.id ).loadCredentials( googleCredentialsDirectory, googlePickerCredentialsFile );
		}
	}

	const playbackConfig = () => ( { ...store.config, scenes: store.config.scenes.map( s => s.type === "google-photos" ? { ...s, sources: connections.forScene( s ).sources( s.id ) } : s ) } );
	let saving = false;
	let state = {
		currentId: pickNext( playbackConfig(), null ), paused: false, pausedAt: null, changedAt: Date.now(), revision: 0
	};

	const reconcilePlayback = () => {
		if ( !playbackConfig().scenes.some( s => s.id === state.currentId && s.enabled && s.sources.length ) ) {
			state.currentId = pickNext( playbackConfig(), null );state.changedAt = Date.now();

			if ( state.paused ) {
				state.pausedAt = state.changedAt;
			}
		}
	};

	const addresses = Object.values( networkInterfaces() ).flat()
		.filter( n => n?.family === "IPv4" && !n.internal )
		.map( n => `http://${n.address}:${port}` );
	const snapshot = () => ( {
		config: store.config, state, widgets: results, apiStatus: connections.status(), googlePhotos: { ...photos?.status(), galleries: connections.galleries() }, displays: displays(), addresses
	} );

	const broadcast = () => {
		const event = `data: ${JSON.stringify( snapshot() )}\n\n`;

		for ( const c of clients ) {
			c.write( event );
		}
	};

	const authorized = req => {
		const candidate = String( req.headers.authorization?.replace( /^Bearer /, "" ) || req.query.token || "" );return Buffer.byteLength( candidate ) === Buffer.byteLength( token ) && timingSafeEqual( Buffer.from( candidate ), Buffer.from( token ) );
	};

	app.disable( "x-powered-by" );app.use( express.json( { limit: "2mb" } ) );
	app.use( (
		req, res, next
	) => {
		res.setHeader( "X-Content-Type-Options", "nosniff" );

		if ( req.path.startsWith( "/api" ) || req.path.startsWith( "/media" ) ) {
			res.setHeader( "Cache-Control", "no-store" );

			if ( !authorized( req ) ) {
				return res.status( 401 ).json( { error: "Bitte mit dem Zugangscode anmelden." } );
			}

			if ( ![ "GET", "HEAD" ].includes( req.method ) && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}` ) {
				return res.status( 403 ).json( { error: "Fremder Ursprung nicht erlaubt" } );
			}
		}

		next();
	} );

	const photoScene = id => {
		const scene = store.config.scenes.find( s => s.id === id && s.type === "google-photos" );

		if ( !scene ) {
			throw Object.assign( new Error( "Google-Photos-Szene nicht gefunden." ), { status: 404 } );
		}

		return scene;
	};

	app.get( "/api/google-photos/status", ( _req, res ) => res.json( { ...photos?.status(), galleries: connections.galleries() } ) );
	app.put( "/api/google-photos/credentials", async( req, res ) => {
		await photos.configure( req.body );res.json( { ok: true } );broadcast();
	} );
	app.post( "/api/google-photos/login", async( _req, res ) => res.json( await photos.startLogin() ) );
	app.post( "/api/google-photos/login/poll", async( _req, res ) => {
		res.json( await photos.pollLogin() );broadcast();
	} );
	app.get( "/api/apis/status", ( _req, res ) => res.json( connections.status() ) );
	app.put( "/api/apis/:id/secrets", async( req, res ) => {
		await connections.saveSecrets( req.params.id, req.body );lastPoll.clear();res.json( { ok: true } );broadcast();void refresh();
	} );
	app.post( "/api/apis/:id/credentials/file", async( req, res ) => {
		const client = connections.client( req.params.id );await client.loadCredentials( googleCredentialsDirectory, connections.definition( req.params.id ).type === "google-picker" ? googlePickerCredentialsFile : googleCredentialsFile );

		if ( client.configurationError ) {
			throw Object.assign( new Error( client.configurationError ), { status: 400 } );
		}

		if ( !client.status().configured ) {
			throw Object.assign( new Error( "Keine passende OAuth-Datei gefunden. Für Picker bitte einen Desktop-Client als config/client_secret_picker.json ablegen." ), { status: 400 } );
		}

		res.json( client.status() );broadcast();
	} );
	app.post( "/api/apis/:id/login", async( req, res ) => res.json( await connections.client( req.params.id ).startLogin( `http://127.0.0.1:${server.address().port}/oauth/google/callback` ) ) );
	app.get( "/oauth/google/callback", async( req, res ) => {
		res.setHeader( "Cache-Control", "no-store" );res.setHeader( "Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" );res.setHeader( "Referrer-Policy", "no-referrer" );const client = [ ...connections.clients.values() ].find( c => c.auth?.state && c.auth.state === req.query.state && c.completeLogin );

		if ( !client ) {
			return res.status( 400 ).type( "html" )
				.send( "<h1>Anmeldung ungültig oder abgelaufen</h1><p>Bitte die Google-Anmeldung in den API-Einstellungen erneut starten.</p>" );
		}

		try {
			await client.completeLogin( req.query );broadcast();res.type( "html" ).send( "<h1>Google Photos verbunden</h1><p>Du kannst dieses Fenster schließen und zur Bilderwand zurückkehren.</p>" );
		} catch {
			broadcast();res.status( 400 ).type( "html" )
				.send( "<h1>Google-Anmeldung fehlgeschlagen</h1><p>Die Einzelheiten stehen unter API-Einstellungen. Bitte dort erneut anmelden.</p>" );
		}
	} );
	app.post( "/api/apis/:id/login/poll", async( req, res ) => {
		res.json( await connections.client( req.params.id ).pollLogin() );broadcast();
	} );

	const pickerScene = id => {
		const scene = store.config.scenes.find( s => s.id === id && s.type === "google-picker" );

		if ( !scene ) {
			throw Object.assign( new Error( "Google-Picker-Szene nicht gefunden." ), { status: 404 } );
		}

		return scene;
	};

	app.post( "/api/google-picker/scenes/:id/session", async( req, res ) => {
		const scene = pickerScene( req.params.id );res.json( await connections.forScene( scene ).start( scene.id ) );broadcast();
	} );
	app.post( "/api/google-picker/scenes/:id/poll", async( req, res ) => {
		const scene = pickerScene( req.params.id );res.json( await connections.forScene( scene ).poll( scene.id ) );
	} );
	app.post( "/api/google-picker/scenes/:id/import", async( req, res ) => {
		const scene = pickerScene( req.params.id );res.json( await connections.forScene( scene ).beginImport( scene ) );broadcast();
	} );
	app.delete( "/api/google-picker/scenes/:id/session", async( req, res ) => {
		const scene = pickerScene( req.params.id );await connections.forScene( scene ).cancel( scene.id );res.json( { ok: true } );broadcast();
	} );
	app.post( "/api/google-photos/scenes/:id/connect", async( req, res ) => {
		await connections.forScene( photoScene( req.params.id ) ).connectScene( photoScene( req.params.id ) );broadcast();res.json( connections.galleries()[ req.params.id ] );
	} );
	app.post( "/api/google-photos/scenes/:id/refresh", async( req, res ) => {
		await connections.forScene( photoScene( req.params.id ) ).refresh( photoScene( req.params.id ), true );reconcilePlayback();broadcast();res.json( connections.galleries()[ req.params.id ] || { status: "disconnected", sources: [] } );
	} );
	app.delete( "/api/google-photos/scenes/:id", async( req, res ) => {
		const scene = photoScene( req.params.id );await connections.forScene( scene ).disconnectScene( req.params.id );reconcilePlayback();broadcast();res.json( { ok: true } );
	} );
	app.get( "/api/google-photos/media/:id/:key", async( req, res ) => {
		const scene = photoScene( req.params.id );

		if ( !scene.enabled ) {
			return res.sendStatus( 404 );
		}

		const controller = new AbortController();res.on( "close", () => controller.abort() );const response = await connections.forScene( scene ).image(
			scene.id, req.params.key, AbortSignal.any( [ controller.signal, AbortSignal.timeout( 20000 ) ] )
		);res.setHeader( "Content-Type", response.headers.get( "content-type" ) );Readable.fromWeb( response.body ).on( "error", () => res.destroy() )
			.pipe( res );
	} );
	app.get( "/api/state", ( _req, res ) => res.json( snapshot() ) );
	app.get( "/api/events", ( req, res ) => {
		res.setHeader( "Content-Type", "text/event-stream" );res.setHeader( "Connection", "keep-alive" );res.flushHeaders();clients.add( res );res.write( `data: ${JSON.stringify( snapshot() )}\n\n` );req.on( "close", () => clients.delete( res ) );
	} );
	app.put( "/api/config", async( req, res ) => {
		if ( saving || req.body.revision !== state.revision ) {
			return res.status( 409 ).json( { error: "Die Einstellungen wurden inzwischen geändert. Bitte neu laden." } );
		}

		saving = true;

		try {
			connections.assertConfigChange( req.body.config );await store.update( req.body.config );state.revision++;

			if ( !eligibleScenes( playbackConfig() ).some( s => s.id === state.currentId ) ) {
				state.currentId = pickNext( playbackConfig(), null );state.changedAt = Date.now();
			}

			lastPoll.clear();await onDisplays( store.config );broadcast();res.json( snapshot() );void refresh();
		} finally {
			saving = false;
		}
	} );
	app.post( "/api/control", async( req, res ) => {
		const { action, id } = req.body;

		if ( action === "pause" ) {
			if ( state.paused ) {
				state.changedAt += Date.now() - state.pausedAt;state.pausedAt = null;
			} else {
				state.pausedAt = Date.now();
			}

			state.paused = !state.paused;
		} else if ( action === "next" || action === "previous" ) {
			state.currentId = pickNext(
				playbackConfig(), state.currentId, action === "previous" ? -1 : 1
			);state.changedAt = Date.now();

			if ( state.paused ) {
				state.pausedAt = state.changedAt;
			}
		} else if ( action === "select" ) {
			if ( !store.config.scenes.some( s => s.id === id && s.enabled && ( s.type === "google-photos" ? connections.forScene( s ).sources( s.id ).length : s.sources.length ) ) ) {
				return res.status( 400 ).json( { error: "Szene ist nicht verfügbar" } );
			}

			state.currentId = id;state.changedAt = Date.now();

			if ( state.paused ) {
				state.pausedAt = state.changedAt;
			}
		} else if ( action === "refresh" ) {
			lastPoll.clear();void refresh();
		} else {
			return res.status( 400 ).json( { error: "Unbekannter Befehl" } );
		}

		broadcast();res.json( snapshot() );
	} );
	app.put( "/api/secrets/:id", async( req, res ) => {
		const widget = store.config.widgets.find( w => w.id === req.params.id );

		if ( !widget?.apiId ) {
			return res.status( 404 ).json( { error: "API-Verbindung nicht gefunden" } );
		}

		await connections.saveSecrets( widget.apiId, req.body );lastPoll.clear();res.json( { ok: true } );void refresh();
	} );
	const upload = multer( {
		storage: multer.diskStorage( {
			destination: path.join( directory, "media" ),
			filename:    (
				_req, file, cb
			) => cb( null, `${randomUUID()}${path.extname( file.originalname ).toLowerCase()}` )
		} ),
		limits:     { fileSize: 50 * 1024 * 1024, files: 30 },
		fileFilter: (
			_req, file, cb
		) => cb( null, /\.(jpe?g|png|webp|gif|avif|html?)$/i.test( file.originalname ) )
	} );
	app.post(
		"/api/upload", upload.array( "files", 30 ), ( req, res ) => {
			if ( !req.files?.length ) {
				return res.status( 400 ).json( { error: "Keine unterstützten Dateien ausgewählt" } );
			}

			res.json( { sources: req.files.map( f => `/media/${f.filename}` ) } );
		}
	);
	app.use(
		"/media", (
			req, res, next
		) => {
			res.setHeader( "Content-Security-Policy", "sandbox allow-scripts; default-src 'self' https: http: data:; connect-src 'none'" );next();
		}, express.static( path.join( directory, "media" ), { dotfiles: "deny" } )
	);
	app.get( "/api/camera/:id/:index", async( req, res ) => {
		const w = store.config.widgets.find( w => w.id === req.params.id && w.type === "cameras" && w.enabled );const api = w && store.config.apis.find( a => a.id === w.apiId && a.type === "cameras" );const c = api?.options.cameras?.[ Number( req.params.index ) ];

		if ( !c?.url ) {
			return res.sendStatus( 404 );
		}

		const u = new URL( c.url );

		if ( ![ "http:", "https:" ].includes( u.protocol ) ) {
			return res.sendStatus( 400 );
		}

		const controller = new AbortController();const timeout = setTimeout( () => controller.abort(), 15000 );res.on( "close", () => controller.abort() );

		try {
			const r = await fetch( u, { signal: controller.signal, headers: store.secrets.apis?.[ w.apiId ]?.authorization ? { Authorization: store.secrets.apis[ w.apiId ].authorization } : {} } );clearTimeout( timeout );

			if ( !r.ok ) {
				return res.sendStatus( 502 );
			}

			const contentType = r.headers.get( "content-type" ) || "";

			if ( !/^(image\/|multipart\/x-mixed-replace)/i.test( contentType ) ) {
				controller.abort();return res.sendStatus( 415 );
			}

			res.setHeader( "Content-Type", contentType );Readable.fromWeb( r.body ).on( "error", () => res.destroy() )
				.pipe( res );
		} finally {
			clearTimeout( timeout );
		}
	} );

	if ( frontend ) {
		const { createServer } = await import( "vite" );const vite = await createServer( { server: { middlewareMode: true }, appType: "spa" } );app.use( vite.middlewares );app.locals.vite = vite;
	} else {
		app.use( express.static( dist ) );app.get( "/{*path}", ( _req, res ) => res.sendFile( path.join( dist, "index.html" ) ) );
	}

	app.use( (
		error, _req, res, _next
	) => {
		console.error( error.message );

		if ( res.headersSent ) {
			return res.end();
		}

		res.status( error.status || ( error.name === "ZodError" || error instanceof multer.MulterError ? 400 : 500 ) ).json( { error: error.name === "ZodError" ? error.issues.map( i => i.message ).join( "; " ) : error.message } );
	} );

	async function refresh() {
		let changed = false;await Promise.allSettled( store.config.scenes.filter( s => s.enabled && s.type === "google-photos" ).map( async scene => {
			const client = connections.forScene( scene );const before = client.galleries[ scene.id ];await client.refresh( scene );

			if ( before !== client.galleries[ scene.id ] ) {
				changed = true;
			}
		} ) );

		if ( changed ) {
			reconcilePlayback();
		}

		await Promise.allSettled( store.config.widgets.filter( w => w.enabled && ![ "clock", "title" ].includes( w.type ) ).map( async w => {
			if ( pending.has( w.id ) || Date.now() - ( lastPoll.get( w.id ) || 0 ) < w.refreshSeconds * 1000 ) {
				return;
			}

			pending.add( w.id );lastPoll.set( w.id, Date.now() );

			try {
				const value = await loadWidget(
					w, store.secrets, store.config.apis
				);

				if ( store.config.widgets.includes( w ) ) {
					results[ w.id ] = {
						...value, status: "ok", updatedAt: Date.now()
					};changed = true;
				}
			} catch( e ) {
				if ( store.config.widgets.includes( w ) ) {
					results[ w.id ] = {
						...results[ w.id ], status: "error", error: e.message
					};changed = true;
				}
			} finally {
				pending.delete( w.id );
			}
		} ) );

		if ( changed ) {
			broadcast();
		}
	}

	const server = await new Promise( ( resolve, reject ) => {
		const s = app.listen(
			port, host, error => error ? reject( error ) : resolve( s )
		);s.on( "error", reject );
	} );void refresh();
	const ticker = setInterval( () => {
		if ( !state.paused && Date.now() - state.changedAt >= store.config.intervalSeconds * 1000 ) {
			state.currentId = pickNext( playbackConfig(), state.currentId );state.changedAt = Date.now();broadcast();
		}

		void refresh();
	}, 1000 );
	const heartbeat = setInterval( () => {
		for ( const c of clients ) {
			c.write( ": heartbeat\n\n" );
		}
	}, 15000 );

	return {
		app,
		store,
		photos,
		connections,
		server,
		token,
		snapshot,
		broadcast,
		async close() {
			clearInterval( ticker );clearInterval( heartbeat );await Promise.allSettled( [ ...connections.clients.values() ].map( client => client.close?.() ) );

			for ( const c of clients ) {
				c.end();
			}

			await app.locals.vite?.close();await new Promise( resolve => {
				server.close( resolve );server.closeAllConnections();
			} );
		}
	};
}
