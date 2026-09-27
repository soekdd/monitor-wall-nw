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

		case "transit": {const d = await fetchJson( `https://widgets.vvo-online.de/abfahrtsmonitor/Abfahrten.do?hst=${encodeURIComponent( o.stop || "" )}` );return {
			lines: d.filter( r => Number( r[ 2 ] ) >= Number( o.minMinutes || 0 ) && !( o.exclude || [] ).includes( r[ 1 ] ) ).slice( 0, Number( o.limit ) || 4 )
				.map( r => `${r[ 0 ]}  ${r[ 1 ]}  ·  ${r[ 2 ]} min` )
		};}

		case "school": {const rows = o.url ? await fetchJson( o.url, { headers: s.authorization ? { Authorization: s.authorization } : {} } ) : o.rows;

			if ( !Array.isArray( rows ) ) {
				throw new Error( "Vertretungsplan muss ein JSON-Array liefern" );
			}

			return {
				lines: rows.filter( r => !o.class || r.class === o.class ).slice( 0, 10 )
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
			timeMin: new Date().toISOString(), timeMax: new Date( Date.now() + ( Number( o.days ) || 7 ) * 86400000 ).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "12"
		} );const d = await fetchJson( `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent( o.calendarId || "primary" )}/events?${params}`, { headers: { Authorization: `Bearer ${token.access_token}` } } );return {
			lines: d.items.map( e => `${new Date( e.start.dateTime || e.start.date ).toLocaleDateString( "de-DE", {
				weekday: "short", day: "2-digit", month: "2-digit"
			} )} ${e.start.dateTime ? new Date( e.start.dateTime ).toLocaleTimeString( "de-DE", { hour: "2-digit", minute: "2-digit" } ) : "Ganztägig"}  ${e.summary}` )
		};}

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
