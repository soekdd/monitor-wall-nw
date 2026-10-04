import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
	mkdtemp, readdir, readFile, rm
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createWallServer } from "../server/app.js";
import { downloadImage } from "../server/image-import.js";
import { webpImage } from "../server/image-processing.js";

const image = ( width, height ) => sharp( {
	create: {
		width,
		height,
		channels:   4,
		background: {
			r: 40, g: 80, b: 120, alpha: 0.5
		}
	}
} ).png()
	.toBuffer();

test( "all stack types fit within 1600px without cropping or enlarging", async() => {
	for ( const type of [ "stack", "google-picker", "google-photos" ] ) {
		for ( const [ width, height, expectedWidth, expectedHeight ] of [ [ 3200, 1800, 1600, 900 ], [ 1800, 3200, 900, 1600 ], [ 300, 200, 300, 200 ] ] ) {
			const metadata = await sharp( await webpImage( await image( width, height ), type ) ).metadata();
			assert.equal( metadata.format, "webp" );assert.equal( metadata.width, expectedWidth );assert.equal( metadata.height, expectedHeight );assert.equal( metadata.hasAlpha, true );
		}
	}
} );
test( "panoramas keep their dimensions and EXIF orientation is applied", async() => {
	for ( const type of [ "panorama", "fit" ] ) {
		const metadata = await sharp( await webpImage( await image( 3200, 1800 ), type ) ).metadata();
		assert.equal( metadata.width, 3200 );assert.equal( metadata.height, 1800 );
	}

	const oriented = await sharp( await image( 2400, 1200 ) ).jpeg()
		.withMetadata( { orientation: 6 } )
		.toBuffer();
	const metadata = await sharp( await webpImage( oriented, "stack" ) ).metadata();
	assert.equal( metadata.width, 800 );assert.equal( metadata.height, 1600 );
	await assert.rejects( webpImage( Buffer.from( "invalid image" ) ) );
} );

test( "images wider than WebP supports are scaled down proportionally", async() => {
	const oversized = await sharp( {
		create: {
			width: 16384, height: 10, channels: 3, background: "blue"
		}
	} ).jpeg()
		.toBuffer();
	const metadata = await sharp( await webpImage( oversized, "fit" ) ).metadata();

	assert.equal( metadata.width, 16383 );assert.equal( metadata.height, 10 );
} );


test( "upload and URL endpoints produce WebP with the requested scene dimensions", async t => {
	const directory = await mkdtemp( path.join( tmpdir(), "wall-webp-" ) );
	const service = await createWallServer( {
		directory, port: 0, host: "127.0.0.1", dist: directory
	} );
	t.after( async() => {
		await service.close();await rm( directory, { recursive: true, force: true } );
	} );
	const base = `http://127.0.0.1:${service.server.address().port}`;
	const bytes = await image( 2400, 1200 );

	for ( const type of [ "stack", "fit", "panorama" ] ) {
		const form = new FormData();form.append( "type", type );form.append(
			"files", new Blob( [ bytes ], { type: "image/png" } ), "picture.png"
		);
		const response = await fetch( `${base}/api/upload`, {
			method: "POST", headers: { Authorization: `Bearer ${service.password}` }, body: form
		} );
		assert.equal( response.status, 200 );
		const { sources } = await response.json();assert.match( sources[ 0 ], /\.webp$/ );
		const metadata = await sharp( await readFile( path.join( directory, sources[ 0 ] ) ) ).metadata();
		assert.equal( metadata.width, type === "stack" ? 1600 : 2400 );assert.equal( metadata.height, type === "stack" ? 800 : 1200 );
	}

	const source = await downloadImage(
		"https://example.com/photo", path.join( directory, "media" ), { type: "stack", fetchImpl: async() => new Response( bytes, { headers: { "content-type": "image/png" } } ) }
	);
	assert.equal( ( await sharp( await readFile( path.join( directory, source ) ) ).metadata() ).width, 1600 );
	const form = new FormData();form.append(
		"files", new Blob( [ bytes ] ), "valid.png"
	);form.append(
		"files", new Blob( [ "not an image" ] ), "broken.png"
	);
	const before = await readdir( path.join( directory, "media" ) );
	const response = await fetch( `${base}/api/upload`, {
		method: "POST", headers: { Authorization: `Bearer ${service.password}` }, body: form
	} );
	assert.equal( response.status, 200 );const result = await response.json();assert.equal( result.sources.length, 1 );assert.equal( result.skipped, 1 );assert.equal( ( await readdir( path.join( directory, "media" ) ) ).length, before.length + 1 );

	const broken = new FormData();broken.append(
		"files", new Blob( [ "not an image" ] ), "broken.jpg"
	);
	const rejected = await fetch( `${base}/api/upload`, {
		method: "POST", headers: { Authorization: `Bearer ${service.password}` }, body: broken
	} );
	assert.equal( rejected.status, 415 );assert.equal( ( await readdir( path.join( directory, "media" ) ) ).length, before.length + 1 );
} );


test( "animated GIF becomes animated WebP with resized frames", async() => {
	const frames = await Promise.all( [ "red", "blue" ].map( background => sharp( {
		create: {
			width: 2400, height: 1200, channels: 3, background
		}
	} ).png()
		.toBuffer() ) );
	const gif = await sharp( frames, { join: { animated: true } } ).gif( { loop: 0, delay: [ 100, 200 ] } )
		.toBuffer();
	const metadata = await sharp( await webpImage( gif, "stack" ), { animated: true } ).metadata();
	assert.equal( metadata.format, "webp" );assert.equal( metadata.pages, 2 );assert.equal( metadata.width, 1600 );assert.equal( metadata.pageHeight, 800 );assert.deepEqual( metadata.delay, [ 100, 200 ] );
} );
