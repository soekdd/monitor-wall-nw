const border = 9;
const stackSize = 25;

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

export function stackLayout(
	monitor, monitorIndex, images, startIndex = 0
) {
	return images.map( ( image, index ) => {
		const i = startIndex + index + 1, n = i + monitorIndex * 5;
		const size = stackImageSize( image, monitor );
		const rotation = n * 13 % 29 - 14;
		const radians = rotation * Math.PI / 180;
		return {
			...size,
			rotation,
			zIndex:  i,
			x:       ( 18.5 + n * 31 % 64 ) / 100 * monitor.width,
			y:       ( 21.5 + n * 23 % 58 ) / 100 * monitor.height,
			extentX: ( Math.abs( Math.cos( radians ) ) * size.width + Math.abs( Math.sin( radians ) ) * size.height ) / 2,
			extentY: ( Math.abs( Math.sin( radians ) ) * size.width + Math.abs( Math.cos( radians ) ) * size.height ) / 2
		};
	} );
}

export function stackPictures(
	sources, step, monitorIndex
) {
	if ( !sources.length ) {
		return [];
	}

	return Array.from( { length: stackSize }, ( _, index ) => sources[ ( step + index + 1 + monitorIndex * stackSize ) % sources.length ] );
}
