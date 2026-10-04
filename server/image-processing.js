import sharp from "sharp";

const webpMaximumDimension = 16383;

export const isStack = type => [ "stack", "google-picker", "google-photos" ].includes( type );

export async function webpImage( input, type = "fit" ) {
	const image = sharp( input, { animated: true } );
	const metadata = await image.metadata();

	if ( ![ "jpeg", "png", "webp", "gif", "heif" ].includes( metadata.format ) ) {
		throw Object.assign( new Error( "Nicht unterstützte Bilddatei." ), { status: 415 } );
	}

	if ( !( metadata.pages > 1 ) ) {
		image.rotate();
	}

	if ( isStack( type ) ) {
		image.resize( {
			width: 1600, height: 1600, fit: "inside", withoutEnlargement: true
		} );
	} else if ( metadata.width > webpMaximumDimension || ( metadata.pageHeight || metadata.height ) > webpMaximumDimension ) {
		image.resize( {
			width: webpMaximumDimension, height: webpMaximumDimension, fit: "inside", withoutEnlargement: true
		} );
	}

	return image.webp( { quality: 85, effort: 4 } ).toBuffer();
}

export async function imageResponseBytes( response, maxBytes = 50 * 1024 * 1024 ) {
	if ( Number( response.headers.get( "content-length" ) ) > maxBytes ) {
		throw Object.assign( new Error( "Das Bild ist zu groß (maximal 50 MB)." ), { status: 413 } );
	}

	const chunks = [];let bytes = 0;
	const reader = response.body.getReader();

	try {
		while ( true ) {
			const { done, value } = await reader.read();

			if ( done ) {
				break;
			}

			bytes += value.length;

			if ( bytes > maxBytes ) {
				throw Object.assign( new Error( "Das Bild ist zu groß (maximal 50 MB)." ), { status: 413 } );
			}

			chunks.push( value );
		}

		return Buffer.concat( chunks );
	} finally {
		await reader.cancel().catch( () => {} );reader.releaseLock();
	}
}
