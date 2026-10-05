import express from "express";
import multer from "multer";
import path from "node:path";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { thumbnailImage, webpImage } from "./image-processing.js";
import {
	publishDurable, syncDirectory, writeDurable
} from "./durable-files.js";
import { networkInterfaces } from "node:os";
import { JsonStore } from "./store.js";
import { pickNext, eligibleScenes } from "./scheduler.js";
import { loadWidget } from "./providers.js";
import { ApiConnections } from "./api-connections.js";
import { downloadImage } from "./image-import.js";
import { retryDelay } from "./retry.js";
import { prepareSceneThumbnails, removeThumbnails } from "./thumbnails.js";

export async function createWallServer( {
	directory, port = 3210, host = "0.0.0.0", frontend, dist, displays = () => [], onDisplays = () => {}, photosOptions = {}, googleCredentialsDirectory, googleCredentialsFile, googlePickerCredentialsFile
} ) {
	const store = await new JsonStore( directory ).init();
	const initialThumbnails = await prepareSceneThumbnails(
		store.config, store.config, { directory, dist }
	);

	if ( JSON.stringify( initialThumbnails.config ) !== JSON.stringify( store.config ) ) {
		await store.update( initialThumbnails.config );
	}

	const password = store.access.password, app = express(), clients = new Set(), results = {}, pending = new Set(), nextPoll = new Map(), successfulPolls = new Set();
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
		currentId: pickNext( playbackConfig(), null ), paused: false, pausedAt: null, changedAt: Date.now(), sceneRevision: 0, revision: 0
	};

	const reconcilePlayback = () => {
		if ( !playbackConfig().scenes.some( s => s.id === state.currentId && s.enabled && s.sources.length ) ) {
			const next = pickNext( playbackConfig(), null );

			if ( next !== state.currentId ) {
				state.sceneRevision++;
			}

			state.currentId = next;state.changedAt = Date.now();

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
		const candidate = String( req.headers.authorization?.replace( /^Bearer /, "" ) || req.query.password || "" );return Buffer.byteLength( candidate ) === Buffer.byteLength( password ) && timingSafeEqual( Buffer.from( candidate ), Buffer.from( password ) );
	};

	app.disable( "x-powered-by" );app.use( express.json( { limit: "2mb" } ) );
	app.use( (
		req, res, next
	) => {
		res.setHeader( "X-Content-Type-Options", "nosniff" );

		if ( req.path.startsWith( "/api" ) || req.path.startsWith( "/media" ) ) {
			res.setHeader( "Cache-Control", "no-store" );

			if ( !authorized( req ) ) {
				return res.status( 401 ).json( { error: "Bitte mit dem Passwort anmelden." } );
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
		await connections.saveSecrets( req.params.id, req.body );nextPoll.clear();res.json( { ok: true } );broadcast();void refresh();
	} );
	app.post( "/api/apis/:id/credentials/file", async( req, res ) => {
		const client = connections.client( req.params.id );await client.loadCredentials( googleCredentialsDirectory, [ "google-picker", "calendar" ].includes( connections.definition( req.params.id ).type ) ? googlePickerCredentialsFile : googleCredentialsFile );

		if ( client.configurationError ) {
			throw Object.assign( new Error( client.configurationError ), { status: 400 } );
		}

		if ( !client.status().configured ) {
			throw Object.assign( new Error( "Keine passende OAuth-Datei gefunden. Für Picker und Kalender bitte einen Desktop-Client als config/client_secret_picker.json ablegen." ), { status: 400 } );
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
			await client.completeLogin( req.query );broadcast();res.type( "html" ).send( "<h1>Google verbunden</h1><p>Du kannst dieses Fenster schließen und zur Bilderwand zurückkehren.</p>" );
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
		);const bytes = Buffer.from( await response.arrayBuffer() );res.setHeader( "Content-Type", "image/webp" );res.send( req.query.thumbnail === "1" ? await thumbnailImage( bytes ) : bytes );
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

		let thumbnails, stored = false;

		try {
			connections.assertConfigChange( req.body.config );thumbnails = await prepareSceneThumbnails(
				req.body.config, store.config, { directory, dist }
			);await store.update( thumbnails.config );stored = true;await removeThumbnails( thumbnails.obsolete );state.revision++;

			const activated = req.body.activateId && playbackConfig().scenes.find( scene => scene.id === req.body.activateId && scene.enabled && scene.sources.length );

			if ( activated ) {
				state.currentId = activated.id;state.changedAt = Date.now();state.sceneRevision++;
			} else if ( !eligibleScenes( playbackConfig() ).some( s => s.id === state.currentId ) ) {
				const next = pickNext( playbackConfig(), null );

				if ( next !== state.currentId ) {
					state.sceneRevision++;
				}

				state.currentId = next;state.changedAt = Date.now();
			}

			nextPoll.clear();await onDisplays( store.config );broadcast();res.json( snapshot() );void refresh();
		} catch( error ) {
			if ( !stored && thumbnails?.created ) {
				await removeThumbnails( thumbnails.created );
			}

			throw error;
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
			);state.changedAt = Date.now();state.sceneRevision++;

			if ( state.paused ) {
				state.pausedAt = state.changedAt;
			}
		} else if ( action === "select" ) {
			if ( !store.config.scenes.some( s => s.id === id && s.enabled && ( s.type === "google-photos" ? connections.forScene( s ).sources( s.id ).length : s.sources.length ) ) ) {
				return res.status( 400 ).json( { error: "Szene ist nicht verfügbar" } );
			}

			state.currentId = id;state.changedAt = Date.now();state.sceneRevision++;

			if ( state.paused ) {
				state.pausedAt = state.changedAt;
			}
		} else if ( action === "refresh" ) {
			nextPoll.clear();void refresh();
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

		await connections.saveSecrets( widget.apiId, req.body );nextPoll.clear();res.json( { ok: true } );void refresh();
	} );
	const upload = multer( {
		storage: multer.diskStorage( {
			destination: path.join( directory, "media" ),
			filename:    (
				_req, file, cb
			) => cb( null, `.upload-${randomUUID()}${path.extname( file.originalname ).toLowerCase()}` )
		} ),
		limits:     { fileSize: 50 * 1024 * 1024, files: 30 },
		fileFilter: (
			_req, file, cb
		) => cb( null, /\.(jpe?g|png|webp|gif|avif|html?)$/i.test( file.originalname ) )
	} );
	app.post(
		"/api/upload", upload.array( "files", 30 ), async( req, res ) => {
			if ( !req.files?.length ) {
				return res.status( 400 ).json( { error: "Keine unterstützten Dateien ausgewählt" } );
			}

			const completed = [];let skipped = 0, result;

			try {
				for ( const file of req.files ) {
					const html = /\.html?$/i.test( file.originalname );
					const name = `${randomUUID()}${html ? path.extname( file.originalname ).toLowerCase() : ".webp"}`;
					const target = path.join(
						directory, "media", name
					);

					if ( html ) {
						await publishDurable( file.path, target, { syncParent: false } );
					} else {
						let converted;

						try {
							converted = await webpImage( file.path, req.body.type || "fit" );
						} catch {
							skipped++;continue;
						}

						await writeDurable( target, converted, { syncParent: false } );
					}

					completed.push( target );
				}

				if ( !completed.length ) {
					throw Object.assign( new Error( "Keine der ausgewählten Bilddateien konnte verarbeitet werden." ), { status: 415 } );
				}

				await syncDirectory( path.join( directory, "media" ) );
				result = { sources: completed.map( f => `/media/${path.basename( f )}` ), skipped };
			} catch( error ) {
				await Promise.all( completed.map( f => rm( f, { force: true } ) ) );
				throw error.status ? error : Object.assign( new Error( "Die Bilddateien konnten nicht verarbeitet werden. Bitte gültige Bilder auswählen." ), { status: 415 } );
			} finally {
				await Promise.all( req.files.map( f => rm( f.path, { force: true } ) ) );
			}

			res.json( result );
		}
	);
	app.post( "/api/import-image", async( req, res ) => {
		const source = await downloadImage(
			req.body?.url, path.join( directory, "media" ), { type: req.body?.type || "fit" }
		);
		res.json( { sources: [ source ] } );
	} );

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
			if ( pending.has( w.id ) || ( nextPoll.get( w.id ) || 0 ) > Date.now() ) {
				return;
			}

			pending.add( w.id );

			try {
				const value = await loadWidget(
					w, store.secrets, store.config.apis
				);

				if ( store.config.widgets.includes( w ) ) {
					results[ w.id ] = {
						...value, status: "ok", updatedAt: Date.now()
					};successfulPolls.add( w.id );nextPoll.set( w.id, Date.now() + w.refreshSeconds * 1000 );changed = true;
				}
			} catch( e ) {
				if ( store.config.widgets.includes( w ) ) {
					results[ w.id ] = {
						...results[ w.id ], status: "error", error: e.message
					};nextPoll.set( w.id, Date.now() + retryDelay(
						successfulPolls.has( w.id ), w.refreshSeconds * 1000, e
					) );changed = true;
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
			state.currentId = pickNext( playbackConfig(), state.currentId );state.changedAt = Date.now();state.sceneRevision++;broadcast();
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
		password,
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
