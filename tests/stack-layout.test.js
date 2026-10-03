import test from "node:test";
import assert from "node:assert/strict";
import {
	advancePictureStack, createPictureStack, distributePictures, initialStackSize, shufflePictures, stackCardLayout, stackImageSize
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

test( "a selection is shuffled reproducibly without duplicates", () => {
	const sources = Array.from( { length: 40 }, ( _, index ) => `image-${index}` );
	const first = shufflePictures( [ ...sources, sources[ 0 ] ], "selection-1" );
	assert.equal( first.length, sources.length );assert.deepEqual( new Set( first ), new Set( sources ) );assert.deepEqual( shufflePictures( sources, "selection-1" ), first );assert.notDeepEqual( shufflePictures( sources, "selection-2" ), first );
} );

test( "stacks start with ten shuffled pictures and grow until every picture is present", () => {
	const sources = Array.from( { length: 81 }, ( _, index ) => `image-${index}` );
	const distributed = distributePictures( sources, 4 );
	const first = createPictureStack( distributed[ 0 ], 0 ), second = createPictureStack( distributed[ 1 ], 1 );
	assert.equal( initialStackSize, 10 );assert.equal( first.cards.length, 10 );assert.equal( second.cards.length, 10 );assert.equal( distributed.flat().length, sources.length );assert.equal( new Set( distributed.flat() ).size, sources.length );
	let growing = first;

	for ( let index = 0; index < 100; index++ ) {
		growing = advancePictureStack( growing );
	}

	assert.equal( growing.cards.length, distributed[ 0 ].length );assert.equal( new Set( growing.cards.map( card => card.source ) ).size, distributed[ 0 ].length );
} );

test( "pictures belong to exactly one monitor stack, including after repeated cycles", () => {
	const sources = Array.from( { length: 37 }, ( _, index ) => `image-${index}` );
	const distributed = distributePictures( sources, 4 );let stacks = distributed.map( ( pictures, index ) => createPictureStack(
		pictures, index, "selection"
	) );

	for ( let step = 0; step < 100; step++ ) {
		const visible = stacks.flatMap( stack => stack.cards.map( card => card.source ) );assert.equal( new Set( visible ).size, visible.length );stacks = stacks.map( advancePictureStack );
	}

	assert.deepEqual( distributePictures( [ "one", "two" ], 4 ).map( pictures => pictures.length ), [ 1, 1, 0, 0 ] );
} );

test( "the first ten cards use random positions centered on every monitor", () => {
	const sources = Array.from( { length: 30 }, ( _, index ) => `image-${index}` );

	for ( const monitorIndex of [ 0, 1, 2, 3 ] ) {
		const cards = createPictureStack(
			sources, monitorIndex, "selection"
		).cards;
		close( cards.reduce( ( sum, card ) => sum + card.x, 0 ) / cards.length, 0.5 );close( cards.reduce( ( sum, card ) => sum + card.y, 0 ) / cards.length, 0.5 );assert.equal( new Set( cards.map( card => `${card.x}:${card.y}` ) ).size, cards.length );
	}

	assert.notDeepEqual( createPictureStack(
		sources, 0, "selection-a"
	).cards.map( card => [ card.x, card.y ] ), createPictureStack(
		sources, 0, "selection-b"
	).cards.map( card => [ card.x, card.y ] ) );
} );

test( "completed source lists cycle from the beginning by moving an existing picture to the top", () => {
	const sources = Array.from( { length: 12 }, ( _, index ) => `image-${index}` );
	let stack = createPictureStack( sources );stack = advancePictureStack( stack );stack = advancePictureStack( stack );
	assert.deepEqual( stack.cards.map( card => card.source ), sources );stack = advancePictureStack( stack );
	assert.deepEqual( stack.cards.map( card => card.source ), [ ...sources.slice( 1 ), sources[ 0 ] ] );stack = advancePictureStack( stack );
	assert.deepEqual( stack.cards.map( card => card.source ), [ ...sources.slice( 2 ), sources[ 0 ], sources[ 1 ] ] );
	assert.deepEqual( createPictureStack( sources.slice( 0, 3 ) ).cards.map( card => card.source ), sources.slice( 0, 3 ) );
} );

test( "adding and recycling pictures leaves retained cards in place", () => {
	const monitors = [ { width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 2560, height: 1440 } ];

	for ( const [ monitorIndex, monitor ] of monitors.entries() ) {
		for ( const count of [ 1, 3, 7, 11, 25, 31 ] ) {
			const sources = Array.from( { length: count }, ( _, index ) => `image-${index}` );
			const dimensions = new Map( sources.map( ( source, index ) => [ source, images[ index % images.length ] ] ) );
			let stack = createPictureStack( sources, monitorIndex );
			const layout = state => state.cards.map( card => ( {
				...stackCardLayout(
					monitor, dimensions.get( card.source ), card
				),
				source: card.source
			} ) );

			for ( let step = 0; step < count * 3; step++ ) {
				const previous = layout( stack );stack = advancePictureStack( stack );const next = layout( stack );
				const retained = previous.filter( card => card.source !== next.at( -1 ).source );
				assert.deepEqual( next.slice( 0, -1 ), retained );
				assert.ok( next.at( -1 ).zIndex > previous.at( -1 ).zIndex );
				assert.equal( new Set( next.map( card => card.source ) ).size, next.length );
			}
		}
	}
} );

test( "adding a picture or learning its dimensions does not reposition other pictures", () => {
	const monitor = { width: 1920, height: 1080 };
	const card = createPictureStack(
		[ "picture" ], 0, "selection"
	).cards[ 0 ];
	const pending = stackCardLayout(
								monitor, undefined, card
							), loaded = stackCardLayout(
								monitor, images[ 0 ], card
							);
	assert.equal( pending.x, loaded.x );assert.equal( pending.y, loaded.y );assert.equal( pending.rotation, loaded.rotation );
} );

test( "empty stacks have no cards", () => {
	assert.deepEqual( createPictureStack( [] ).cards, [] );assert.deepEqual( advancePictureStack( createPictureStack( [] ) ).cards, [] );
} );
