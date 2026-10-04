import path from "node:path";
import { randomUUID } from "node:crypto";
import {
	access, rm, writeFile
} from "node:fs/promises";
import { thumbnailImage } from "./image-processing.js";

const thumbnailPath = ( directory, source ) => source?.startsWith( "/media/thumbnail-" ) ? path.join(
	directory, "media", source.slice( "/media/".length )
) : null;

function localSourcePath(
	source, directory, dist
) {
	let root, relative;

	if ( source?.startsWith( "/media/" ) ) {
		root = directory;relative = source.slice( "/media/".length );
	} else if ( source?.startsWith( "/demo/" ) && dist ) {
		root = dist;relative = source.slice( 1 );
	} else {
		return null;
	}

	const resolvedRoot = path.resolve( root ), resolved = path.resolve( resolvedRoot, relative );
	return resolved.startsWith( `${resolvedRoot}${path.sep}` ) ? resolved : null;
}

export async function prepareSceneThumbnails(
	config, previous, { directory, dist }
) {
	const next = structuredClone( config ), created = [], obsolete = [];

	try {
		for ( const scene of next.scenes ) {
			const old = previous?.scenes.find( candidate => candidate.id === scene.id );
			const source = scene.type === "html" ? null : scene.sources[ 0 ];
			const oldThumbnail = thumbnailPath( directory, old?.thumbnail );

			if ( source && old?.sources[ 0 ] === source && oldThumbnail ) {
				try {
					await access( oldThumbnail );scene.thumbnail = old.thumbnail;continue;
				} catch {}
			}

			delete scene.thumbnail;

			if ( oldThumbnail ) {
				obsolete.push( oldThumbnail );
			}

			const input = localSourcePath(
				source, path.join( directory, "media" ), dist
			);

			if ( !input ) {
				continue;
			}

			const name = `thumbnail-${randomUUID()}.webp`, target = path.join(
				directory, "media", name
			);
			let bytes;

			try {
				await access( input );
				bytes = await thumbnailImage( input );
			} catch( error ) {
				if ( error.code === "ENOENT" ) {
					continue;
				}

				throw error;
			}

			await writeFile(
				target, bytes, { flag: "wx", mode: 0o600 }
			);
			created.push( target );scene.thumbnail = `/media/${name}`;
		}

		for ( const old of previous?.scenes || [] ) {
			if ( !next.scenes.some( scene => scene.id === old.id ) ) {
				const file = thumbnailPath( directory, old.thumbnail );

				if ( file ) {
					obsolete.push( file );
				}
			}
		}

		return {
			config: next, created, obsolete: [ ...new Set( obsolete ) ]
		};
	} catch( error ) {
		await Promise.all( created.map( file => rm( file, { force: true } ) ) );throw error;
	}
}

export const removeThumbnails = files => Promise.all( files.map( file => rm( file, { force: true } ) ) );
