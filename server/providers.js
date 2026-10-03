import net from "node:net";

export async function fetchJson( url, options = {} ) {
	const u = new URL( url );

	if ( ![ "http:", "https:" ].includes( u.protocol ) ) {
		throw new Error( "Nur HTTP(S) erlaubt" );
	}

	const r = await fetch( u, { ...options, signal: AbortSignal.timeout( 12000 ) } );

	if ( !r.ok ) {
		throw new Error( `Dienst antwortet mit HTTP ${r.status}` );
	}

	return r.json();
}

const decodeXml = value => {
	const cdata = [];const text = value
		.replace( /<!\[CDATA\[([\s\S]*?)\]\]>/g, ( _, content ) => `\0${cdata.push( content ) - 1}\0` )
		.replace( /<[^>]*>/g, "" )
		.replace( /&#x([0-9a-f]+);/gi, ( _, code ) => String.fromCodePoint( Number.parseInt( code, 16 ) ) )
		.replace( /&#([0-9]+);/g, ( _, code ) => String.fromCodePoint( Number.parseInt( code, 10 ) ) )
		.replace( /&(amp|lt|gt|quot|apos);/g, ( _, entity ) => ( {
			amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'"
		} )[ entity ] )
		.replace( /\0(\d+)\0/g, ( _, index ) => cdata[ Number( index ) ] )
		.trim();

	return text;
};

const xmlValue = ( xml, tag ) => {
	const match = xml.match( new RegExp( `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i" ) );

	return match ? decodeXml( match[ 1 ] ) : "";
};

export function parseSchoolXml( xml ) {
	if ( !/<(?:vp|aktion)(?:\s|>)/i.test( xml ) ) {
		throw new Error( "Vertretungsplan liefert weder ein JSON-Array noch gültiges Stundenplan24-XML" );
	}

	return [ ...xml.matchAll( /<aktion(?:\s[^>]*)?>([\s\S]*?)<\/aktion>/gi ) ].map( match => ( {
		class:   xmlValue( match[ 1 ], "klasse" ),
		lesson:  xmlValue( match[ 1 ], "stunde" ),
		subject: xmlValue( match[ 1 ], "fach" ),
		text:    xmlValue( match[ 1 ], "info" )
	} ) );
}

export function calendarLines( items, limit = 12 ) {
	return items
		.filter( event => !String( event.summary || "" ).trimStart()
			.startsWith( "//" ) )
		.slice( 0, limit )
		.map( event => `${new Date( event.start.dateTime || event.start.date ).toLocaleDateString( "de-DE", {
			weekday: "short", day: "2-digit", month: "2-digit"
		} )} ${event.start.dateTime ? new Date( event.start.dateTime ).toLocaleTimeString( "de-DE", { hour: "2-digit", minute: "2-digit" } ) : "Ganztägig"}  ${event.summary || ""}` );
}

const vvoTime = value => {
	const match = String( value || "" ).match( /\/Date\((\d+)/ );

	return match ? Number( match[ 1 ] ) : Date.parse( value );
};

export function transitLines(
	departures, options = {}, now = Date.now()
) {
	const normalizedDestination = destination => String( destination || "" ).trim()
		.toLocaleLowerCase( "de-DE" );const blacklist = new Set( [
		...Array.isArray( options.destinationBlacklist ) ? options.destinationBlacklist : [],
		...Array.isArray( options.exclude ) ? options.exclude : []
	].map( normalizedDestination ).filter( Boolean ) );const minimum = Number( options.minMinutes ) || 0;const limit = Number( options.limit ) || 4;

	return departures
		.filter( departure => !departure.CancelReasons?.length && !blacklist.has( normalizedDestination( departure.Direction ) ) )
		.map( departure => ( {
			...departure,
			minutes: Math.ceil( ( vvoTime( departure.RealTime || departure.ScheduledTime ) - now ) / 60000 )
		} ) )
		.filter( departure => Number.isFinite( departure.minutes ) && departure.minutes >= minimum )
		.slice( 0, limit )
		.map( departure => `${departure.LineName}  ${departure.Direction}  ·  ${departure.minutes} min` );
}

const configuredTransitStops = options => {
	const stops = Array.isArray( options.stops ) && options.stops.length ? options.stops : [ { name: options.stop, id: options.stopId } ];

	return stops.map( stop => typeof stop === "string" ? { name: stop, id: "" } : {
		name: String( stop.name || stop.stop || "" ).trim(),
		id:   String( stop.id || stop.stopId || "" ).trim()
	} ).filter( stop => stop.name || stop.id );
};

async function fetchVvoDepartures( stop, options ) {
	let stopId = stop.id;

	if ( !stopId ) {
		const params = new URLSearchParams( {
			query: stop.name, limit: "5", stopsOnly: "true", regionalOnly: "true", format: "json"
		} );const points = await fetchJson( `https://webapi.vvo-online.de/tr/pointfinder?${params}` );stopId = String( points.Points?.[ 0 ] || "" ).split( "|" )[ 0 ];
	}

	if ( !stopId ) {
		throw new Error( `VVO-Haltestelle nicht gefunden: ${stop.name || "keine Angabe"}` );
	}

	const requested = Math.min( 50, Math.max( 12, ( Number( options.limit ) || 4 ) * 4 ) );const data = await fetchJson( "https://webapi.vvo-online.de/dm", {
		method:  "POST",
		headers: { "Content-Type": "application/json;charset=UTF-8" },
		body:    JSON.stringify( {
			stopid: stopId, limit: requested, shorttermchanges: true, format: "json"
		} )
	} );

	if ( data.Status?.Code !== "Ok" || !Array.isArray( data.Departures ) ) {
		throw new Error( `VVO-Abfahrten konnten nicht geladen werden${data.Status?.Message ? `: ${data.Status.Message}` : ""}` );
	}

	return { name: data.Name || stop.name || stopId, departures: data.Departures };
}

async function fetchSchoolRows( url, secrets ) {
	const u = new URL( url );

	if ( ![ "http:", "https:" ].includes( u.protocol ) ) {
		throw new Error( "Nur HTTP(S) erlaubt" );
	}

	const headers = {};

	if ( secrets.authorization ) {
		headers.Authorization = secrets.authorization;
	} else if ( secrets.username || secrets.password ) {
		headers.Authorization = `Basic ${Buffer.from( `${secrets.username || ""}:${secrets.password || ""}` ).toString( "base64" )}`;
	}

	const response = await fetch( u, { headers, signal: AbortSignal.timeout( 12000 ) } );

	if ( !response.ok ) {
		throw new Error( `Dienst antwortet mit HTTP ${response.status}` );
	}

	const body = await response.text(), contentType = response.headers.get( "content-type" ) || "";

	if ( /json/i.test( contentType ) || /^\s*\[/.test( body ) ) {
		return JSON.parse( body );
	}

	return parseSchoolXml( body );
}

export function mpd( options, password ) {
	return new Promise( ( resolve, reject ) => {
		const socket = net.createConnection( { host: options.host || "127.0.0.1", port: Number( options.port ) || 6600 } );let buffer = "", greeted = false;

		const fail = e => {
			socket.destroy();reject( e );
		};

		socket.setTimeout( 5000, () => fail( new Error( "MPD antwortet nicht" ) ) );socket.on( "error", fail );socket.on( "end", () => {
			if ( !buffer.endsWith( "OK\n" ) ) {
				fail( new Error( "MPD-Verbindung geschlossen" ) );
			}
		} );socket.on( "data", part => {
			buffer += part.toString();

			if ( !greeted && buffer.includes( "\n" ) ) {
				if ( !buffer.startsWith( "OK MPD " ) ) {
					return fail( new Error( "Ungültiger MPD-Server" ) );
				}

				greeted = true;buffer = buffer.slice( buffer.indexOf( "\n" ) + 1 );socket.write( `command_list_begin\n${password ? `password ${JSON.stringify( password )}\n` : ""}status\ncurrentsong\ncommand_list_end\n` );
			}

			if ( buffer.includes( "ACK " ) ) {
				return fail( new Error( "MPD: Anmeldung oder Befehl fehlgeschlagen" ) );
			}

			if ( greeted && buffer.endsWith( "OK\n" ) ) {
				socket.destroy();const data = Object.fromEntries( buffer.split( "\n" ).filter( l => l.includes( ": " ) )
					.map( l => {
						const i = l.indexOf( ": " );return [ l.slice( 0, i ).toLowerCase(), l.slice( i + 2 ) ];
					} ) );resolve( { lines: [ data.title || data.name || "Kein Titel", [ data.artist, data.album ].filter( Boolean ).join( " · " ), data.state === "play" ? "Wiedergabe" : data.state === "pause" ? "Pausiert" : "Gestoppt" ] } );
			}
		} );
	} );
}

export async function loadWidget(
	w, secrets, apis = []
) {
	const api = apis.find( a => a.id === w.apiId && a.type === w.type );

	if ( !api ) {
		throw new Error( "Bitte eine passende Verbindung in den API-Einstellungen auswählen." );
	}

	const o = api.options, s = secrets.apis?.[ api.id ] || {};

	switch ( w.type ) {
		case "weather": {const d = await fetchJson( `https://api.open-meteo.com/v1/forecast?latitude=${Number( o.latitude ) || 51.05}&longitude=${Number( o.longitude ) || 13.74}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3` );return { lines: [ `${Math.round( d.current.temperature_2m )} °C`, ...d.daily.time.map( ( day, i ) => `${new Date( day ).toLocaleDateString( "de-DE", { weekday: "short" } )}  ${Math.round( d.daily.temperature_2m_min[ i ] )}° / ${Math.round( d.daily.temperature_2m_max[ i ] )}°` ) ] };}

		case "transit": {const stops = configuredTransitStops( o );

			if ( !stops.length ) {
				throw new Error( "Keine VVO-Haltestelle konfiguriert" );
			}

			const results = await Promise.all( stops.map( stop => fetchVvoDepartures( stop, o ) ) );return { lines: results.flatMap( result => transitLines( result.departures, o ) ) };}

		case "school": {const rows = o.url ? await fetchSchoolRows( o.url, s ) : o.rows;

			if ( !Array.isArray( rows ) ) {
				throw new Error( "Vertretungsplan muss ein JSON-Array liefern" );
			}

			const configuredClasses = [ ...new Set( (
				Array.isArray( o.class ) ? o.class : Array.isArray( o.classes ) ? o.classes : o.class ? [ o.class ] : []
			)
				.map( value => String( value ).trim() )
				.filter( Boolean ) ) ];
			const details = row => typeof row === "string" ? row : [ row.date, row.lesson, row.subject, row.text ].filter( Boolean ).join( " · " );

			if ( configuredClasses.length ) {
				return {
					lines: configuredClasses.map( schoolClass => {
						const hits = rows.filter( row => typeof row === "object" && row?.class === schoolClass ).map( details );

						return `${schoolClass}: ${hits.length ? hits.join( " / " ) : "keine Vertretungen"}`;
					} )
				};
			}

			return {
				lines: rows.slice( 0, 10 )
					.map( r => typeof r === "string" ? r : [ r.date, r.class, r.lesson, r.subject, r.text ].filter( Boolean ).join( " · " ) )
			};}

		case "mpd": return mpd( o, s.password );

		case "calendar": {if ( !s.refreshToken || !s.clientId || !s.clientSecret ) {
			throw new Error( "Google-OAuth-Zugangsdaten fehlen" );
		}

		const token = await fetchJson( "https://oauth2.googleapis.com/token", {
			method:  "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body:    new URLSearchParams( {
				client_id: s.clientId, client_secret: s.clientSecret, refresh_token: s.refreshToken, grant_type: "refresh_token"
			} )
		} );const params = new URLSearchParams( {
			timeMin: new Date().toISOString(), timeMax: new Date( Date.now() + ( Number( o.days ) || 7 ) * 86400000 ).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50"
		} );const d = await fetchJson( `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent( o.calendarId || "primary" )}/events?${params}`, { headers: { Authorization: `Bearer ${token.access_token}` } } );return { lines: calendarLines( d.items || [] ) };}

		case "cameras": return { cameras: ( o.cameras || [] ).map( ( c, i ) => ( { name: c.name || `Kamera ${i + 1}`, index: i } ) ) };

		case "soccer": {const d = await fetchJson( `https://api.openligadb.de/getmatchdata/${encodeURIComponent( o.league || "bl1" )}/${Number( o.season ) || new Date().getFullYear()}` );return {
			lines: d.filter( m => !o.team || [ m.team1.teamName, m.team2.teamName ].some( n => n.includes( o.team ) ) ).slice( -6 )
				.map( m => {
					const r = m.matchResults.find( r => r.resultTypeID === 2 ) || m.matchResults.at( -1 );return `${m.team1.shortName || m.team1.teamName}  ${r ? `${r.pointsTeam1} : ${r.pointsTeam2}` : "– : –"}  ${m.team2.shortName || m.team2.teamName}`;
				} )
		};}

		default: return { lines: [] };
	}
}
