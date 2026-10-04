import { thumbnailImage, webpImage } from "./image-processing.js";
import { writeFile } from "node:fs/promises";
import {
	randomUUID, randomBytes, createHash
} from "node:crypto";
import {
	mkdir, rename, rm, access
} from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GooglePhotos, googleLink } from "./google-photos.js";

const API = "https://photospicker.googleapis.com/v1";
const extensions = {
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif"
};
const fail = ( message, status = 400 ) => Object.assign( new Error( message ), { status } );
export class GooglePicker extends GooglePhotos {
	constructor(
		credentialsStore, store, options = {}
	) {
		super( credentialsStore, options );this.wallStore = store;this.onImport = options.onImport || ( () => {} );this.jobs = new Map();this.requests = new Map();this.pollTimes = new Map();this.closing = false;this.shutdown = new AbortController();
	}
	isImporting() {
		return [ ...this.jobs.values() ].some( job => job.status === "importing" );
	}
	importingScene( id ) {
		return this.jobs.get( id )?.status === "importing";
	}
	status() {
		const { galleries, ...status } = super.status();return {
			...status,
			imports: Object.fromEntries( [ ...this.jobs ].map( ( [ id, job ] ) => [ id, {
				status: job.status, completed: job.completed, total: job.total, skipped: job.skipped, error: job.error
			} ] ) )
		};
	}
	async loadCredentials( directory, file ) {
		if ( !file ) {
			if ( !directory ) {
				return;
			}

			file = path.join( directory, "client_secret_picker.json" );

			try {
				await access( file );
			} catch( e ) {
				if ( e.code === "ENOENT" ) {
					return;
				}

				throw e;
			}
		}

		await super.loadCredentials( undefined, file );
	}
	async startLogin( redirectUri ) {
		if ( this.configurationError ) {
			throw fail( this.configurationError );
		}

		if ( !this.credentials.clientId || !this.credentials.clientSecret ) {
			throw fail( "Bitte unter API-Einstellungen einen Google-OAuth-Client vom Typ Desktop-App für die Picker API hinterlegen." );
		}

		const redirect = new URL( redirectUri );

		if ( redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1" || redirect.pathname !== "/oauth/google/callback" ) {
			throw fail( "Ungültiger lokaler OAuth-Rückkanal." );
		}

		if ( this.auth?.expiresAt > this.now() ) {
			return {
				authorizationUrl: this.auth.url, expiresAt: this.auth.expiresAt, pollSeconds: 2
			};
		}

		const verifier = randomBytes( 32 ).toString( "base64url" ), state = randomBytes( 32 ).toString( "base64url" );
		const params = new URLSearchParams( {
			client_id:      this.credentials.clientId,
			redirect_uri:   redirect.href,
			response_type:  "code",
			scope:          this.scope,
			access_type:    "offline",
			prompt:         "consent",
			state,
			code_challenge: createHash( "sha256" ).update( verifier )
				.digest( "base64url" ),
			code_challenge_method: "S256"
		} );
		this.auth = {
			state, verifier, redirectUri: redirect.href, expiresAt: this.now() + 10 * 60000, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`
		};this.authError = null;
		return {
			authorizationUrl: this.auth.url, expiresAt: this.auth.expiresAt, pollSeconds: 2
		};
	}
	async completeLogin( query ) {
		const auth = this.auth;

		if ( !auth || query.state !== auth.state || auth.expiresAt <= this.now() ) {
			throw fail( "Diese Google-Anmeldung ist ungültig oder abgelaufen. Bitte erneut starten." );
		}

		if ( auth.busy ) {
			throw fail( "Google-Anmeldung wird bereits verarbeitet.", 409 );
		}

		auth.busy = true;

		try {
			if ( query.error ) {
				throw fail( "Die Google-Kontofreigabe wurde abgelehnt oder abgebrochen." );
			}

			if ( typeof query.code !== "string" || !query.code || query.code.length > 4000 ) {
				throw fail( "Google hat keinen gültigen Anmeldecode geliefert." );
			}

			const c = this.credentials;
			const data = await this.json( "https://oauth2.googleapis.com/token", {
				method:  "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body:    new URLSearchParams( {
					client_id: c.clientId, client_secret: c.clientSecret, code: query.code, code_verifier: auth.verifier, redirect_uri: auth.redirectUri, grant_type: "authorization_code"
				} )
			} );

			if ( !data.refresh_token || !data.access_token || data.scope && !data.scope.split( " " ).includes( this.scope ) ) {
				throw fail( "Google hat die Picker-Berechtigung nicht dauerhaft freigegeben. Bitte erneut anmelden.", 502 );
			}

			await this.store.updateSecrets( s => ( { ...s, googlePhotos: { ...s.googlePhotos, refreshToken: data.refresh_token } } ) );
			this.access = { token: data.access_token, expiresAt: this.now() + ( Number( data.expires_in ) || 3600 ) * 1000 };this.auth = null;
		} catch( e ) {
			this.auth = null;this.authError = e.message;throw e;
		}
	}
	async pollLogin() {
		if ( this.authError ) {
			const message = this.authError;this.authError = null;throw fail( message );
		}

		if ( this.auth?.expiresAt <= this.now() ) {
			this.auth = null;throw fail( "Die Google-Anmeldung ist abgelaufen. Bitte erneut starten." );
		}

		return {
			connected: !this.auth && !!this.credentials.refreshToken, pending: !!this.auth, pollSeconds: 2
		};
	}
	async pickerApi(
		route, method = "GET", body
	) {
		const url = API + route, options = {
			method, headers: { Authorization: `Bearer ${await this.accessToken()}`, ...body ? { "Content-Type": "application/json" } : {} }, ...body ? { body: JSON.stringify( body ) } : {}
		};

		if ( method === "DELETE" ) {
			const r = await this.fetch( url, {
				...options, signal: AbortSignal.timeout( 15000 ), redirect: "error"
			} );

			if ( !r.ok && r.status !== 404 ) {
				throw fail( "Google-Auswahlsitzung konnte nicht geschlossen werden.", 502 );
			}

			return;
		}

		return this.json( url, options );
	}
	async configure( values ) {
		if ( this.credentials.clientId && this.credentials.clientId !== values.clientId && Object.keys( this.credentials.sessions || {} ).length ) {
			throw fail( "Bitte zuerst die laufenden Google-Auswahlen abbrechen, bevor du den OAuth-Client wechselst." );
		}

		return super.configure( values );
	}
	session( id ) {
		return this.credentials.sessions?.[ id ];
	}
	view( session ) {
		return {
			pickerUri: session.pickerUri, expiresAt: session.expiresAt, pollSeconds: session.pollSeconds || 5, status: session.ready ? "ready" : "waiting"
		};
	}
	async exclusive( id, operation ) {
		if ( this.requests.has( id ) ) {
			return this.requests.get( id );
		}

		const request = operation();this.requests.set( id, request );

		try {
			return await request;
		} finally {
			this.requests.delete( id );
		}
	}
	async start( id ) {
		return this.exclusive( id, async() => {
			if ( this.importingScene( id ) ) {
				throw fail( "Fotoimport läuft bereits.", 409 );
			}

			const old = this.session( id );

			if ( old && old.expiresAt > this.now() ) {
				return this.view( old );
			}

			if ( old ) {
				await this.cancelSession( id );
			}

			const d = await this.pickerApi(
				"/sessions", "POST", { pickingConfig: { maxItemCount: "2000" } }
			);

			if ( !d.id || !googleLink( d.pickerUri ) || new URL( d.pickerUri ).hostname !== "photos.google.com" || !( Date.parse( d.expireTime ) > this.now() ) ) {
				throw fail( "Google hat keine gültige Fotoauswahl zurückgegeben.", 502 );
			}

			const session = {
				id: d.id, pickerUri: d.pickerUri, expiresAt: Date.parse( d.expireTime ), pollSeconds: Math.max( 1, parseFloat( d.pollingConfig?.pollInterval ) || 5 ), ready: !!d.mediaItemsSet
			};
			await this.store.updateSecrets( s => ( { ...s, googlePhotos: { ...s.googlePhotos, sessions: { ...s.googlePhotos?.sessions, [ id ]: session } } } ) );this.jobs.delete( id );this.pollTimes.delete( id );return this.view( session );
		} );
	}
	async poll( id ) {
		return this.exclusive( id, async() => {
			const job = this.jobs.get( id );

			if ( job?.status === "importing" || job?.status === "done" ) {
				return {
					status: job.status, completed: job.completed, total: job.total
				};
			}

			const session = structuredClone( this.session( id ) );

			if ( !session ) {
				throw fail( "Bitte zuerst Fotos auswählen." );
			}

			if ( session.expiresAt <= this.now() ) {
				throw fail( "Die Fotoauswahl ist abgelaufen. Bitte eine neue Auswahl starten." );
			}

			if ( session.ready || ( this.pollTimes.get( id ) || 0 ) > this.now() ) {
				return this.view( session );
			}

			this.pollTimes.set( id, this.now() + session.pollSeconds * 1000 );
			const d = await this.pickerApi( `/sessions/${encodeURIComponent( session.id )}` );
			session.ready = !!d.mediaItemsSet;session.pollSeconds = Math.max( 1, parseFloat( d.pollingConfig?.pollInterval ) || 5 );

			if ( d.expireTime ) {
				session.expiresAt = Date.parse( d.expireTime );
			}

			await this.store.updateSecrets( s => ( { ...s, googlePhotos: { ...s.googlePhotos, sessions: { ...s.googlePhotos?.sessions, [ id ]: session } } } ) );

			if ( !session.ready && parseFloat( d.pollingConfig?.timeoutIn ) === 0 ) {
				throw fail( "Google hat die Wartezeit beendet. Bitte die Auswahl abbrechen und neu starten." );
			}

			return this.view( session );
		} );
	}
	async cancelSession( id ) {
		const session = this.session( id );

		if ( session ) {
			await this.pickerApi( `/sessions/${encodeURIComponent( session.id )}`, "DELETE" );
		}

		await this.store.updateSecrets( s => {
			const sessions = { ...s.googlePhotos?.sessions };delete sessions[ id ];return { ...s, googlePhotos: { ...s.googlePhotos, sessions } };
		} );this.pollTimes.delete( id );
	}
	async cancel( id ) {
		return this.exclusive( id, async() => {
			if ( this.importingScene( id ) ) {
				throw fail( "Bitte den laufenden Fotoimport abwarten.", 409 );
			}

			await this.cancelSession( id );this.jobs.delete( id );
		} );
	}
	async beginImport( scene ) {
		return this.exclusive( scene.id, async() => {
			if ( this.closing ) {
				throw fail( "Anwendung wird beendet.", 409 );
			}

			if ( this.importingScene( scene.id ) ) {
				return { status: "importing" };
			}

			const session = this.session( scene.id );

			if ( !session?.ready || session.expiresAt <= this.now() ) {
				throw fail( "Bitte zuerst die Fotoauswahl bei Google abschließen." );
			}

			const job = {
				status: "importing", completed: 0, total: 0, skipped: 0
			};this.jobs.set( scene.id, job );
			job.promise = this.importFiles(
				scene, session, job
			).catch( e => {
				job.status = "error";job.error = e.message;
			} )
				.finally( () => this.onImport() );
			return { status: "importing" };
		} );
	}
	async importFiles(
		scene, session, job
	) {
		const media = path.join( this.wallStore.directory, "media" ), staging = path.join( media, `.picker-${randomUUID()}` ), files = [];
		let thumbnail;
		await mkdir( staging, { recursive: true } );let committed = false;

		try {
			const items = new Map(), pages = new Set();let pageToken;

			do {
				this.shutdown.signal.throwIfAborted();

				if ( pageToken && pages.has( pageToken ) ) {
					throw fail( "Google hat eine ungültige Seitennavigation geliefert.", 502 );
				}

				if ( pageToken ) {
					pages.add( pageToken );
				}

				const params = new URLSearchParams( {
					sessionId: session.id, pageSize: "100", ...pageToken ? { pageToken } : {}
				} );
				const data = await this.pickerApi( `/mediaItems?${params}` );

				for ( const item of data.mediaItems || [] ) {
					if ( item.id && extensions[ item.mediaFile?.mimeType ] ) {
						items.set( item.id, item );
					}
				}

				if ( items.size > 2000 || pages.size >= 20 && data.nextPageToken ) {
					throw fail( "Die Auswahl überschreitet das Limit von 2000 Fotos." );
				}

				pageToken = data.nextPageToken;
			} while ( pageToken );

			if ( !items.size ) {
				throw fail( "Die Auswahl enthält keine unterstützten Fotos. Videos werden nicht importiert." );
			}

			job.total = items.size;this.onImport();let totalBytes = 0;

			for ( const item of items.values() ) {
				this.shutdown.signal.throwIfAborted();
				const u = new URL( item.mediaFile.baseUrl );

				if ( u.protocol !== "https:" || !u.hostname.endsWith( ".googleusercontent.com" ) || u.username || u.password || u.search || u.hash ) {
					throw fail( "Google hat eine ungültige Bildadresse geliefert.", 502 );
				}

				const name = `google-picker-${randomUUID()}.webp`;
				const response = await this.fetch( `${u.href}=d`, {
					headers: { Authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.any( [ this.shutdown.signal, AbortSignal.timeout( 120000 ) ] ), redirect: "error"
				} );

				if ( !response.ok || !extensions[ ( response.headers.get( "content-type" ) || "" ).split( ";" )[ 0 ] ] ) {
					throw fail( "Ein ausgewähltes Foto konnte nicht heruntergeladen werden.", 502 );
				}

				let bytes = 0;
				const limit = new Transform( {
					transform(
						chunk, _encoding, callback
					) {
						bytes += chunk.length;totalBytes += chunk.length;

						if ( bytes > 50 * 1024 * 1024 || totalBytes > 2 * 1024 * 1024 * 1024 ) {
							callback( fail( "Importlimit erreicht: maximal 50 MB pro Foto und 2 GB pro Auswahl." ) );
						} else {
							callback( null, chunk );
						}
					}
				} );
				await pipeline(
					Readable.fromWeb( response.body ), limit, createWriteStream( path.join( staging, `${name}.download` ), { flags: "wx", mode: 0o600 } ), { signal: this.shutdown.signal }
				);

				if ( !bytes ) {
					throw fail( "Google hat eine leere Bilddatei geliefert.", 502 );
				}

				let converted;

				try {
					converted = await webpImage( path.join( staging, `${name}.download` ), "google-picker" );
				} catch {
					await rm( path.join( staging, `${name}.download` ), { force: true } );
					job.completed++;job.skipped++;this.onImport();continue;
				}

				this.shutdown.signal.throwIfAborted();
				await writeFile(
					path.join( staging, name ), converted, { flag: "wx", mode: 0o600 }
				);
				await rm( path.join( staging, `${name}.download` ), { force: true } );
				files.push( name );job.completed++;this.onImport();
			}

			this.shutdown.signal.throwIfAborted();

			if ( !files.length ) {
				throw fail( "Keines der ausgewählten Fotos konnte verarbeitet werden. Der bisherige Stapel bleibt erhalten.", 415 );
			}

			for ( const name of files ) {
				await rename( path.join( staging, name ), path.join( media, name ) );
			}

			const thumbnailName = `thumbnail-${randomUUID()}.webp`;
			thumbnail = path.join( media, thumbnailName );await writeFile(
				thumbnail, await thumbnailImage( path.join( media, files[ 0 ] ) ), { flag: "wx", mode: 0o600 }
			);
			let oldThumbnail;

			await this.wallStore.modifyConfig( config => {
				const target = config.scenes.find( s => s.id === scene.id && s.type === "google-picker" && s.apiId === scene.apiId );

				if ( !target ) {
					throw fail( "Die Szene wurde während des Imports verändert. Der bisherige Stapel bleibt erhalten.", 409 );
				}

				oldThumbnail = target.thumbnail;target.sources = files.map( name => `/media/${name}` );target.thumbnail = `/media/${thumbnailName}`;return config;
			} );
			committed = true;

			if ( oldThumbnail?.startsWith( "/media/thumbnail-" ) ) {
				await rm( path.join( media, oldThumbnail.slice( "/media/".length ) ), { force: true } );
			}

			job.status = "done";this.onImport( true );

			// Imported files are durable; session cleanup must not undo a completed import.
			try {
				await this.cancelSession( scene.id );
			} catch {
				job.error = "Fotos importiert. Die Google-Auswahlsitzung konnte noch nicht geschlossen werden.";
			}
		} finally {
			await rm( staging, { recursive: true, force: true } );

			if ( !committed ) {
				await Promise.all( [ ...files.map( name => path.join( media, name ) ), thumbnail ].filter( Boolean ).map( file => rm( file, { force: true } ) ) );
			}
		}
	}
	async close() {
		this.closing = true;this.shutdown.abort();await Promise.allSettled( [ ...this.jobs.values() ].map( job => job.promise ) );
	}
}
