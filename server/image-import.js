import path from "node:path";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { webpImage } from "./image-processing.js";
import { writeDurable } from "./durable-files.js";

const extensions = {
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif"
};
const fail = ( message, status = 400 ) => Object.assign( new Error( message ), { status } );

export async function downloadImage(
	value, directory, {
		fetchImpl = fetch, maxBytes = 50 * 1024 * 1024, timeoutMs = 60000, type = "fit"
	} = {}
) {
	let url;

	try {
		url = new URL( value );
	} catch {
		throw fail( "Bitte eine gültige HTTP(S)-Bild-URL eingeben." );
	}

	if ( ![ "http:", "https:" ].includes( url.protocol ) || url.username || url.password ) {
		throw fail( "Bitte eine HTTP(S)-Bild-URL ohne Zugangsdaten eingeben." );
	}

	const controller = new AbortController(), timer = setTimeout( () => controller.abort(), timeoutMs );
	let staging, output;

	try {
		const response = await fetchImpl( url, { signal: controller.signal } );

		if ( !response.ok ) {
			throw fail( `Das Bild konnte nicht heruntergeladen werden (HTTP ${response.status}).`, 502 );
		}

		const extension = extensions[ response.headers.get( "content-type" )?.split( ";" )[ 0 ].trim().toLowerCase() ];

		if ( !extension || !response.body ) {
			throw fail( "Die URL liefert kein unterstütztes Bild (JPEG, PNG, WebP, GIF oder AVIF).", 415 );
		}

		if ( Number( response.headers.get( "content-length" ) ) > maxBytes ) {
			throw fail( "Das Bild ist zu groß (maximal 50 MB).", 413 );
		}

		const name = `panorama-${randomUUID()}.webp`, target = path.join( directory, name );
		staging = `${target}.download`;
		let size = 0;
		const limit = new Transform( {
			transform(
				chunk, _encoding, callback
			) {
				size += chunk.length;
				callback( size > maxBytes ? fail( "Das Bild ist zu groß (maximal 50 MB).", 413 ) : null, chunk );
			}
		} );
		await pipeline(
			Readable.fromWeb( response.body ), limit, createWriteStream( staging, { flags: "wx" } ), { signal: controller.signal }
		);

		if ( !size ) {
			throw fail( "Die heruntergeladene Bilddatei ist leer." );
		}

		const converted = await webpImage( staging, type );
		controller.signal.throwIfAborted();
		await writeDurable( target, converted );
		return `/media/${name}`;
	} catch( error ) {
		if ( controller.signal.aborted ) {
			throw fail( "Der Download hat zu lange gedauert. Bitte erneut versuchen.", 504 );
		}

		if ( error.status ) {
			throw error;
		}

		throw fail( "Das Bild konnte nicht heruntergeladen werden. Bitte URL und Verbindung prüfen.", 502 );
	} finally {
		clearTimeout( timer );controller.abort();

		await Promise.all( [ staging, output ].filter( Boolean ).map( file => rm( file, { force: true } ) ) );
	}
}
