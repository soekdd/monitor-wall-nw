import sharp from "sharp";
import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp, readFile, readdir, rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { downloadImage } from "../server/image-import.js";

test( "URL import saves an image locally, including URLs without a file extension", async t => {
	const directory = await mkdtemp( path.join( tmpdir(), "wall-image-" ) );
	t.after( () => rm( directory, { recursive: true, force: true } ) );
	const bytes = await sharp( {
		create: {
			width: 2400, height: 1200, channels: 3, background: "red"
		}
	} ).png()
		.toBuffer();
	const source = await downloadImage(
		"https://example.com/photo?id=1", directory, { fetchImpl: async() => new Response( bytes, { headers: { "content-type": "image/jpeg; charset=binary" } } ) }
	);
	assert.match( source, /^\/media\/panorama-.*\.webp$/ );
	const metadata = await sharp( await readFile( path.join( directory, path.basename( source ) ) ) ).metadata();
	assert.equal( metadata.format, "webp" );assert.equal( metadata.width, 2400 );assert.equal( metadata.height, 1200 );
} );

test( "URL import rejects invalid sources and removes incomplete downloads", async t => {
	const directory = await mkdtemp( path.join( tmpdir(), "wall-image-" ) );
	t.after( () => rm( directory, { recursive: true, force: true } ) );

	for ( const url of [ "bad URL", "file:///tmp/image.jpg", "https://user:password@example.com/photo" ] ) {
		await assert.rejects( downloadImage( url, directory ), { status: 400 } );
	}

	await assert.rejects( downloadImage(
		"https://example.com", directory, { fetchImpl: async() => new Response( "HTML", { headers: { "content-type": "text/html" } } ) }
	), { status: 415 } );
	await assert.rejects( downloadImage(
		"https://example.com", directory, { fetchImpl: async() => new Response( "missing", { status: 404 } ) }
	), { status: 502 } );
	await assert.rejects( downloadImage(
		"https://example.com", directory, { maxBytes: 2, fetchImpl: async() => new Response( "large image", { headers: { "content-type": "image/png" } } ) }
	), { status: 413 } );
	await assert.rejects( downloadImage(
		"https://example.com", directory, { fetchImpl: async() => new Response( "", { headers: { "content-type": "image/png" } } ) }
	), { status: 400 } );
	await assert.rejects( downloadImage(
		"https://example.com", directory, { timeoutMs: 5, fetchImpl: async( _url, { signal } ) => new Promise( ( _resolve, reject ) => signal.addEventListener( "abort", () => reject( signal.reason ) ) ) }
	), { status: 504 } );
	assert.deepEqual( await readdir( directory ), [] );
} );
