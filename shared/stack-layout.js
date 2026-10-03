const border = 9;
export const initialStackSize = 10;

function seededRandom( seed ) {
	let state = 2166136261;

	for ( const character of String( seed ) ) {
		state = Math.imul( state ^ character.codePointAt( 0 ), 16777619 );
	}

	return () => {
		state += 0x6D2B79F5;
		let value = state;
		value = Math.imul( value ^ value >>> 15, value | 1 );value ^= value + Math.imul( value ^ value >>> 7, value | 61 );
		return ( ( value ^ value >>> 14 ) >>> 0 ) / 4294967296;
	};
}

export function shufflePictures( sources, seed ) {
	const pictures = [ ...new Set( sources ) ], random = seed === undefined ? Math.random : seededRandom( seed );

	for ( let index = pictures.length - 1; index > 0; index-- ) {
		const other = Math.floor( random() * ( index + 1 ) );
		[ pictures[ index ], pictures[ other ] ] = [ pictures[ other ], pictures[ index ] ];
	}

	return pictures;
}

export function distributePictures( sources, stackCount ) {
	if ( stackCount <= 0 ) {
		return [];
	}

	const stacks = Array.from( { length: stackCount }, () => [] );

	for ( const [ index, source ] of [ ...new Set( sources ) ].entries() ) {
		stacks[ index % stackCount ].push( source );
	}

	return stacks;
}

export function stackImageSize( image, monitor ) {
	const width = image?.width || monitor.width, height = image?.height || monitor.height;
	const area = monitor.width * monitor.height * 0.3;
	const frame = Math.min( border, Math.sqrt( area ) / 4 );
	const linear = 2 * frame * ( width + height ), available = area - 4 * frame * frame;
	const scale = Math.min(
		2 * available / ( Math.sqrt( linear * linear + 4 * width * height * available ) + linear ), ( monitor.width - 2 * frame ) / width, ( monitor.height - 2 * frame ) / height
	);
	return {
		width: width * scale + 2 * frame, height: height * scale + 2 * frame, border: frame
	};
}

export function stackCardLayout(
	monitor, image, card
) {
	const size = stackImageSize( image, monitor );
	const radians = card.rotation * Math.PI / 180;
	return {
		...size,
		rotation: card.rotation,
		zIndex:   card.placement,
		x:        card.x * monitor.width,
		y:        card.y * monitor.height,
		extentX:  ( Math.abs( Math.cos( radians ) ) * size.width + Math.abs( Math.sin( radians ) ) * size.height ) / 2,
		extentY:  ( Math.abs( Math.sin( radians ) ) * size.width + Math.abs( Math.cos( radians ) ) * size.height ) / 2
	};
}

function pictureCard(
	source, placement, seed
) {
	const pair = Math.floor( ( placement - 1 ) / 2 ), random = seededRandom( `${seed}:position:${pair}` );
	let x = 0.19 + random() * 0.62, y = 0.22 + random() * 0.56;

	if ( placement % 2 === 0 ) {
		x = 1 - x;y = 1 - y;
	}

	const rotation = seededRandom( `${seed}:rotation:${placement}` )() * 28 - 14;
	return {
		source, placement, x, y, rotation
	};
}

export function createPictureStack(
	sources, monitorIndex = 0, seed = "stack"
) {
	const order = [ ...new Set( sources ) ];
	const initial = Math.min( initialStackSize, order.length ), stackSeed = `${seed}:monitor:${monitorIndex}`;
	return {
		order,
		seed:          stackSeed,
		cursor:        order.length ? initial % order.length : 0,
		nextPlacement: initial + 1,
		cards:         order.slice( 0, initial ).map( ( source, index ) => pictureCard(
			source, index + 1, stackSeed
		) )
	};
}

export function advancePictureStack( stack ) {
	if ( !stack.order.length ) {
		return stack;
	}

	const source = stack.order[ stack.cursor ];
	return {
		...stack,
		cursor:        ( stack.cursor + 1 ) % stack.order.length,
		nextPlacement: stack.nextPlacement + 1,
		cards:         [ ...stack.cards.filter( card => card.source !== source ), pictureCard(
			source, stack.nextPlacement, stack.seed
		) ]
	};
}
