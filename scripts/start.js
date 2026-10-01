import { spawn } from "node:child_process";
import electron from "electron";

const env = { ...process.env };delete env.ELECTRON_RUN_AS_NODE;
const args = process.platform === "linux" ? [ "--ozone-platform=x11", "--log-level=3", "." ] : [ "." ];
const child = spawn(
	electron, args, { stdio: "inherit", env }
);

child.on( "error", error => {
	console.error( error );process.exit( 1 );
} );
child.on( "exit", ( code, signal ) => {
	if ( signal ) {
		console.error( `Electron wurde mit Signal ${signal} beendet.` );
	}

	process.exit( code ?? ( signal ? 1 : 0 ) );
} );
