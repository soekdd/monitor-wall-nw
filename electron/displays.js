function sameBounds( a, b ) {
	return [ "x", "y", "width", "height" ].every( key => a?.[ key ] === b?.[ key ] );
}

const byPosition = ( a, b ) => a.y - b.y || a.x - b.x;

export function findDisplay( displays, monitor ) {
	if ( !monitor ) {
		return undefined;
	}

	return displays.find( display => String( display.id ) === monitor.displayId ) ||
		displays.find( display => sameBounds( display.bounds, monitor.displayBounds || monitor ) );
}

export function matchDisplays( displays, monitors ) {
	const matches = new Map(), available = new Set( displays );

	const assign = ( monitor, display ) => {
		if ( display && available.has( display ) ) {
			matches.set( monitor.id, display );available.delete( display );
		}
	};

	for ( const monitor of monitors ) {
		assign( monitor, displays.find( display => String( display.id ) === monitor.displayId ) );
	}

	for ( const monitor of monitors.filter( m => !matches.has( m.id ) && m.displayBounds ) ) {
		assign( monitor, displays.find( display => sameBounds( display.bounds, monitor.displayBounds ) ) );
	}

	for ( const monitor of monitors.filter( m => !matches.has( m.id ) && !m.displayBounds ) ) {
		assign( monitor, displays.find( display => sameBounds( display.bounds, monitor ) ) );
	}

	const unmatched = monitors.filter( monitor => !matches.has( monitor.id ) ).sort( byPosition );
	const remaining = [ ...available ].sort( ( a, b ) => byPosition( a.bounds, b.bounds ) );

	if ( unmatched.length === remaining.length && unmatched.every( ( monitor, index ) => monitor.width === remaining[ index ].bounds.width && monitor.height === remaining[ index ].bounds.height ) ) {
		unmatched.forEach( ( monitor, index ) => assign( monitor, remaining[ index ] ) );
	}

	return matches;
}

export function displayName( display, primaryId ) {
	const label = display.label?.trim() || "Bildschirm";
	const {
		x, y, width, height
	} = display.bounds;
	const primary = display.id === primaryId ? " · Hauptbildschirm" : "";

	return `${label} · ${width}×${height} · Position ${x},${y} · ID ${display.id}${primary}`;
}
