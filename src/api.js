import { reactive } from "vue";
const fragment = new URLSearchParams( location.hash.slice( 1 ) );
let password = fragment.get( "password" ) || sessionStorage.getItem( "wall-password" ) || "";

if ( fragment.has( "password" ) ) {
	sessionStorage.setItem( "wall-password", password );history.replaceState(
		null, "", location.pathname + location.search
	);
}

export const wall = reactive( {
	config: null, state: {}, widgets: {}, apiStatus: {}, googlePhotos: { galleries: {} }, displays: [], addresses: [], connected: false, error: "", authenticated: false
} );
let events;
export const getPassword = () => password;

export function createId() {
	return globalThis.crypto.randomUUID?.() || Array.from( globalThis.crypto.getRandomValues( new Uint8Array( 16 ) ), n => n.toString( 16 ).padStart( 2, "0" ) ).join( "" );
}

export function mediaUrl( url ) {
	return url?.startsWith( "/media/" ) || url?.startsWith( "/api/google-photos/media/" ) ? `${url}?password=${encodeURIComponent( password )}` : url;
}

export function sceneSources( scene ) {
	return scene?.type === "google-photos" ? wall.googlePhotos?.galleries?.[ scene.id ]?.sources || [] : scene?.sources || [];
}

export async function request(
	route, method = "GET", body
) {
	const response = await fetch( `/api${route}`, {
		method, headers: { Authorization: `Bearer ${password}`, ...body && !( body instanceof FormData ) ? { "Content-Type": "application/json" } : {} }, body: body ? body instanceof FormData ? body : JSON.stringify( body ) : undefined
	} );const value = await response.json();

	if ( !response.ok ) {
		throw new Error( value.error || `HTTP ${response.status}` );
	}

	return value;
}

export async function connect( value = password ) {
	password = value;const snapshot = await request( "/state" );Object.assign(
		wall, snapshot, { authenticated: true, connected: true }
	);sessionStorage.setItem( "wall-password", password );events?.close();events = new EventSource( `/api/events?password=${encodeURIComponent( password )}` );

	events.onmessage = e => {
		Object.assign(
			wall, JSON.parse( e.data ), { connected: true }
		);
	};

	events.onerror = () => wall.connected = false;
}

export async function action( action, id ) {
	try {
		Object.assign( wall, await request(
			"/control", "POST", { action, id }
		) );
	} catch( e ) {
		wall.error = e.message;
	}
}

export async function save( config ) {
	const response = await request(
		"/config", "PUT", { config, revision: wall.state.revision }
	);Object.assign( wall, response );
}

export function logout() {
	events?.close();sessionStorage.removeItem( "wall-password" );password = "";wall.authenticated = false;wall.config = null;
}
