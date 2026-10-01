function sameBounds( a, b ) {
	return [ "x", "y", "width", "height" ].every( key => a?.[ key ] === b?.[ key ] );
}

export function findDisplay( displays, monitor ) {
	if ( !monitor ) {
		return undefined;
	}

	return displays.find( display => String( display.id ) === monitor.displayId ) ||
		displays.find( display => sameBounds( display.bounds, monitor ) );
}

export function displayName( display, primaryId ) {
	const label = display.label?.trim() || "Bildschirm";
	const {
		x, y, width, height
	} = display.bounds;
	const primary = display.id === primaryId ? " · Hauptbildschirm" : "";

	return `${label} · ${width}×${height} · Position ${x},${y} · ID ${display.id}${primary}`;
}
