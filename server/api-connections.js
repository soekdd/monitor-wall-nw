import { GooglePhotos } from "./google-photos.js";
import { GooglePicker } from "./google-picker.js";
import { apiTypes } from "../shared/api-types.js";

export function apiStore( store, id ) {
	return {
		get secrets() {
			return { googlePhotos: store.secrets.apis?.[ id ] || {} };
		},
		updateSecrets( update ) {
			return store.updateSecrets( s => ( { ...s, apis: { ...s.apis, [ id ]: update( { googlePhotos: s.apis?.[ id ] || {} } ).googlePhotos } } ) );
		}
	};
}

export class ApiConnections {
	constructor(
		store, options = {}, onImport = () => {}
	) {
		this.store = store; this.options = options; this.onImport = onImport; this.clients = new Map();
	}
	definition( id ) {
		const api = this.store.config.apis.find( a => a.id === id );

		if ( !api ) {
			throw Object.assign( new Error( "API-Verbindung nicht gefunden." ), { status: 404 } );
		}

		return api;
	}
	client( id ) {
		const api = this.definition( id ), type = apiTypes.find( t => t.value === api.type );

		if ( !type.google ) {
			throw Object.assign( new Error( "Diese API verwendet keine Google-Anmeldung." ), { status: 400 } );
		}

		if ( !this.clients.has( id ) ) {
			this.clients.set( id, api.type === "google-picker" ?
				new GooglePicker(
					apiStore( this.store, id ), this.store, {
						...this.options, scope: type.scope, onImport: this.onImport
					}
				) :
				new GooglePhotos( apiStore( this.store, id ), { ...this.options, scope: type.scope } ) );
		}

		return this.clients.get( id );
	}
	forScene( scene ) {
		const expected = scene.type === "google-photos" ? "google-ambient" : "google-picker";

		if ( this.definition( scene.apiId ).type !== expected ) {
			throw Object.assign( new Error( "Die Szene verweist auf eine unpassende API." ), { status: 400 } );
		}

		return this.client( scene.apiId );
	}
	status() {
		return Object.fromEntries( this.store.config.apis.map( api => [ api.id, apiTypes.find( t => t.value === api.type ).google ?
			this.client( api.id ).status() :
			{ configured: true, secretFields: Object.keys( this.store.secrets.apis?.[ api.id ] || {} ) } ] ) );
	}
	galleries() {
		return Object.assign( {}, ...this.store.config.apis.filter( a => a.type === "google-ambient" ).map( a => this.client( a.id ).publicGalleries() ) );
	}
	async saveSecrets( id, values ) {
		const api = this.definition( id );
		const allowed = [ "username", "authorization", "password", "clientId", "clientSecret", "refreshToken", "apiKey" ];

		if ( !values || Array.isArray( values ) || typeof values !== "object" || Object.entries( values ).some( ( [ k, v ] ) => !allowed.includes( k ) || typeof v !== "string" || v.length > 4000 || /[\r\n]/.test( v ) ) ) {
			throw Object.assign( new Error( "Ungültige API-Zugangsdaten." ), { status: 400 } );
		}

		if ( apiTypes.find( t => t.value === api.type ).google ) {
			const client = this.client( id );

			if ( client.isImporting?.() ) {
				throw Object.assign( new Error( "Bitte den laufenden Fotoimport abwarten." ), { status: 409 } );
			}

			const merged = { ...client.credentials, ...values };

			if ( "clientId" in values || "clientSecret" in values ) {
				await client.configure( merged );
			}

			client.access = null;client.auth = null;
		}

		await this.store.updateSecrets( s => ( { ...s, apis: { ...s.apis, [ id ]: { ...s.apis?.[ id ], ...values } } } ) );
	}
	assertConfigChange( next ) {
		for ( const api of this.store.config.apis ) {
			const client = this.clients.get( api.id ), replacement = next.apis?.find( a => a.id === api.id );

			if ( replacement && replacement.type !== api.type ) {
				throw Object.assign( new Error( "API-Typ bestehender Verbindungen kann nicht geändert werden. Bitte eine neue Verbindung anlegen." ), { status: 409 } );
			}

			const bindings = this.store.secrets.apis?.[ api.id ]?.devices || {};

			for ( const [ id, binding ] of Object.entries( bindings ) ) {
				if ( ( binding.id || client?.pending?.has( id ) ) && !next.scenes?.some( s => s.id === id && s.type === "google-photos" && s.apiId === api.id ) ) {
					throw Object.assign( new Error( "Bitte die Google-Photos-Galerie vor dem Entfernen oder API-Wechsel trennen." ), { status: 409 } );
				}
			}

			for ( const [ id, session ] of Object.entries( this.store.secrets.apis?.[ api.id ]?.sessions || {} ) ) {
				if ( !client?.importingScene?.( id ) && session.expiresAt > ( client?.now() || Date.now() ) && !next.scenes?.some( s => s.id === id && s.type === "google-picker" && s.apiId === api.id ) ) {
					throw Object.assign( new Error( "Bitte die Google-Fotoauswahl vor dem Entfernen oder API-Wechsel abbrechen." ), { status: 409 } );
				}
			}

			if ( client?.isImporting?.() && ( !replacement || next.scenes?.some( s => client.importingScene( s.id ) && ( s.apiId !== api.id || s.type !== "google-picker" ) ) || this.store.config.scenes.some( s => client.importingScene( s.id ) && !next.scenes?.some( n => n.id === s.id ) ) ) ) {
				throw Object.assign( new Error( "Bitte den laufenden Fotoimport vor dem Entfernen oder API-Wechsel abwarten." ), { status: 409 } );
			}
		}
	}
}
