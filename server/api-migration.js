import { apiTypeForScene } from "../shared/api-types.js";
const canonical = value => JSON.stringify( value, ( _key, item ) => item && typeof item === "object" && !Array.isArray( item ) ? Object.fromEntries( Object.entries( item ).sort( ( [ a ], [ b ] ) => a.localeCompare( b ) ) ) : item );

// Deterministic IDs let a restart recover if migration stopped between the two JSON writes.
export function migrateApis( input, inputSecrets ) {
	const config = structuredClone( input ), secrets = structuredClone( inputSecrets );
	config.apis ||= []; secrets.apis ||= {};

	const ensure = (
		id, title, type, options = {}, credentials = {}
	) => {
		if ( !config.apis.some( a => a.id === id ) ) {
			config.apis.push( {
				id, title, type, options
			} );
		}

		secrets.apis[ id ] = { ...credentials, ...secrets.apis[ id ] };
		return id;
	};

	const ambientId = config.apis.find( a => a.type === "google-ambient" )?.id || "google-ambient";

	if ( !( "apis" in input ) || secrets.googlePhotos || config.scenes.some( s => s.type === "google-photos" && !s.apiId ) ) {
		ensure(
			ambientId, "Google Photos · Ambient", "google-ambient", {}, secrets.googlePhotos
		);
	}

	if ( !( "apis" in input ) || config.scenes.some( s => s.type === "google-picker" && !s.apiId ) ) {
		ensure(
			config.apis.find( a => a.type === "google-picker" )?.id || "google-picker", "Google Photos · Import", "google-picker"
		);
	}

	delete secrets.googlePhotos;

	for ( const scene of config.scenes ) {
		if ( apiTypeForScene( scene.type ) && !scene.apiId ) {
			scene.apiId = config.apis.find( a => a.type === apiTypeForScene( scene.type ) ).id;
		}
	}

	for ( const widget of config.widgets ) {
		if ( [ "clock", "title" ].includes( widget.type ) ) {
			delete widget.apiId; continue;
		}

		if ( !widget.apiId ) {
			const shared = config.apis.find( a => a.type === widget.type && canonical( a.options ) === canonical( widget.options ) && canonical( secrets.apis[ a.id ] || {} ) === canonical( secrets[ widget.id ] || {} ) );
			widget.apiId = shared?.id || ensure(
				`api-${widget.id}`, widget.title, widget.type, widget.options, secrets[ widget.id ]
			);
		} else if ( secrets[ widget.id ] ) {
			secrets.apis[ widget.apiId ] = { ...secrets[ widget.id ], ...secrets.apis[ widget.apiId ] };
		}

		widget.options = {};
		delete secrets[ widget.id ];
	}

	return { config, secrets };
}
