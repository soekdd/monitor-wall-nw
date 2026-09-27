import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWallServer } from "./app.js";
const root = fileURLToPath( new URL( "../", import.meta.url ) );
const wall = await createWallServer( {
	directory: process.env.WALL_DATA_DIR || path.join( root, "data" ), port: Number( process.env.WALL_PORT ) || 3210, host: process.env.WALL_HOST || "0.0.0.0", frontend: process.argv.includes( "--dev" ), dist: path.join( root, "dist" ), googleCredentialsDirectory: path.join( root, "config" ), googleCredentialsFile: process.env.WALL_GOOGLE_OAUTH_FILE, googlePickerCredentialsFile: process.env.WALL_GOOGLE_PICKER_OAUTH_FILE
} );
console.log( `Monitor Wall: http://localhost:${wall.server.address().port}/admin\nZugangscode: ${wall.token}\nMobil: ${wall.snapshot().addresses.join( ", " )}` );

for ( const signal of [ "SIGINT", "SIGTERM" ] ) {
	process.on( signal, async() => {
		await wall.close();process.exit( 0 );
	} );
}
