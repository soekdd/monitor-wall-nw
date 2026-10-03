import { randomBytes, createHash } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { GooglePhotos } from "./google-photos.js";

const fail = ( message, status = 400 ) => Object.assign( new Error( message ), { status } );

export class GoogleBrowserOAuth extends GooglePhotos {
	constructor( store, options = {} ) {
		super( store, options );this.serviceName = options.serviceName || "Google";this.credentialsFile = options.credentialsFile || "client_secret_picker.json";
	}
	async loadCredentials( directory, file ) {
		if ( !file ) {
			if ( !directory ) {
				return;
			}

			file = path.join( directory, this.credentialsFile );

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
			throw fail( `Bitte einen Google-OAuth-Client vom Typ Desktop-App für ${this.serviceName} hinterlegen.` );
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
				throw fail( `Google hat die Berechtigung für ${this.serviceName} nicht dauerhaft freigegeben. Bitte erneut anmelden.`, 502 );
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
}
