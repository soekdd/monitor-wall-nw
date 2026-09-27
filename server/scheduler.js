export function eligibleScenes( config, date = new Date() ) {
	const month = date.getMonth();const season = [ "winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter" ][ month ];return config.scenes.filter( s => s.enabled && s.sources.length && ( !s.seasons.length || s.seasons.includes( season ) ) && ( !s.hours.length || s.hours.includes( date.getHours() ) ) );
}

export function pickNext(
	config, currentId, direction = 1, date = new Date(), random = Math.random
) {
	const all = eligibleScenes( config, date );

	if ( !all.length ) {
		return null;
	}

	if ( !config.shuffle || direction === -1 ) {
		const index = all.findIndex( s => s.id === currentId );return all[ ( index + direction + all.length ) % all.length ].id;
	}

	const pool = all.length > 1 ? all.filter( s => s.id !== currentId ) : all;let n = random() * pool.reduce( ( sum, s ) => sum + s.weight, 0 );return ( pool.find( s => ( n -= s.weight ) < 0 ) || pool.at( -1 ) ).id;
}
