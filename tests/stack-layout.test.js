import test from "node:test";
import assert from "node:assert/strict";
import {
	stackImageSize, stackLayout, stackPictures
} from "../shared/stack-layout.js";

const close = ( actual, expected ) => assert.ok( Math.abs( actual - expected ) < 0.000001, `${actual} != ${expected}` );
const images = [ { width: 4000, height: 1000 }, { width: 1000, height: 4000 }, { width: 1600, height: 900 }, { width: 900, height: 1600 }, { width: 1000, height: 1000 }, { width: 50, height: 30 }, { width: 3000, height: 500 } ];

test( "each picture preserves its ratio and occupies at most 30% including its frame", () => {
	for ( const monitor of [ { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 3440, height: 1440 } ] ) {
		for ( const image of images ) {
			const card = stackImageSize( image, monitor );
			assert.ok( card.width * card.height <= monitor.width * monitor.height * 0.3 + 0.000001 );
			assert.ok( card.width <= monitor.width && card.height <= monitor.height );
			close( ( card.width - 2 * card.border ) / ( card.height - 2 * card.border ), image.width / image.height );
		}
	}
} );

test( "adding and removing pictures leaves retained cards unchanged across source cycles", () => {
	const monitors = [ { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 2560, height: 1440 } ];

	for ( const [ monitorIndex, monitor ] of monitors.entries() ) {
		for ( const count of [ 1, 3, 7, 11, 25, 31 ] ) {
			const sources = Array.from( { length: count }, ( _, index ) => `image-${index}` );
			const dimensions = new Map( sources.map( ( source, index ) => [ source, images[ index % images.length ] ] ) );

			const cardsAt = step => {
				const pictures = stackPictures(
					sources, step, monitorIndex
				);
				return stackLayout(
					monitor, monitorIndex, pictures.map( source => dimensions.get( source ) ), step
				).map( ( card, index ) => ( { ...card, source: pictures[ index ] } ) );
			};

			for ( let step = 0; step < count * 3; step++ ) {
				const previous = cardsAt( step ), next = cardsAt( step + 1 );
				assert.deepEqual( next.slice( 0, -1 ), previous.slice( 1 ) );
				assert.ok( next.at( -1 ).zIndex > previous.at( -1 ).zIndex );
				assert.equal( new Set( next.map( card => card.zIndex ) ).size, 25 );
				assert.equal( next.at( -1 ).source, sources[ ( step + 26 + monitorIndex * 25 ) % count ] );
			}
		}
	}
} );

test( "adding a picture or learning its dimensions does not reposition other pictures", () => {
	const monitor = { width: 1920, height: 1080 };
	const previous = stackLayout(
		monitor, 0, images.slice( 0, 6 )
	);
	const pending = stackLayout(
		monitor, 0, [ ...images.slice( 0, 6 ), undefined ]
	);
	const loaded = stackLayout(
		monitor, 0, images
	);
	assert.deepEqual( pending.slice( 0, 6 ), previous );
	assert.deepEqual( loaded.slice( 0, 6 ), previous );
	assert.equal( pending[ 6 ].x, loaded[ 6 ].x );
	assert.equal( pending[ 6 ].y, loaded[ 6 ].y );
	assert.equal( pending[ 6 ].rotation, loaded[ 6 ].rotation );
} );

test( "empty stacks have no cards", () => {
	assert.deepEqual( stackPictures(
		[], 0, 0
	), [] );
	assert.deepEqual( stackLayout(
		{ width: 1920, height: 1080 }, 0, []
	), [] );
} );
