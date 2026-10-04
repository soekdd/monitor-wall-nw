import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath( import.meta.url );
const project = path.resolve( path.dirname( script ), ".." );
const electron = path.join(
	project, "node_modules", "electron", "dist", "electron"
);
const pidFile = path.join(
	os.homedir(), ".config", "monitor-wall", "monitor-wall.pid"
);

async function processExists( pid ) {
	try {
		process.kill( pid, 0 );return true;
	} catch( error ) {
		if ( error.code === "ESRCH" ) {
			return false;
		}

		throw error;
	}
}

async function findProjectElectron() {
	if ( process.platform !== "linux" ) {
		return undefined;
	}

	const entries = await fs.readdir( "/proc", { withFileTypes: true } );

	for ( const entry of entries ) {
		if ( !entry.isDirectory() || !/^\d+$/.test( entry.name ) ) {
			continue;
		}

		try {
			const [ cwd, command ] = await Promise.all( [
				fs.readlink( `/proc/${entry.name}/cwd` ),
				fs.readFile( `/proc/${entry.name}/cmdline`, "utf8" )
			] );
			const parts = command.split( "\0" ).filter( Boolean );

			if ( cwd === project && parts[ 0 ]?.startsWith( electron ) && !command.includes( "--type=" ) ) {
				return Number( entry.name );
			}
		} catch {}
	}

	return undefined;
}

let pid;

try {
	pid = Number( ( await fs.readFile( pidFile, "utf8" ) ).trim() );
} catch( error ) {
	if ( error.code === "ENOENT" ) {
		pid = await findProjectElectron();

		if ( !pid ) {
			console.log( "Monitor Wall läuft nicht." );process.exit( 0 );
		}
	} else {
		throw error;
	}
}

if ( !Number.isSafeInteger( pid ) || pid < 2 ) {
	throw new Error( `Ungültige PID-Datei: ${pidFile}` );
}

if ( !await processExists( pid ) ) {
	await fs.rm( pidFile, { force: true } );
	console.log( "Monitor Wall läuft nicht; eine veraltete PID-Datei wurde entfernt." );process.exit( 0 );
}

if ( process.platform === "linux" ) {
	const [ cwd, command ] = await Promise.all( [
		fs.readlink( `/proc/${pid}/cwd` ),
		fs.readFile( `/proc/${pid}/cmdline`, "utf8" )
	] );

	if ( cwd !== project || !command.startsWith( electron ) || command.includes( "--type=" ) ) {
		throw new Error( `PID ${pid} gehört nicht zu Monitor Wall; der Prozess wurde nicht beendet.` );
	}
}

process.kill( pid, "SIGTERM" );

const deadline = Date.now() + 10000;

while ( await processExists( pid ) && Date.now() < deadline ) {
	await new Promise( resolve => setTimeout( resolve, 100 ) );
}

if ( await processExists( pid ) ) {
	throw new Error( `Monitor Wall (PID ${pid}) reagiert nicht auf SIGTERM.` );
}

console.log( "Monitor Wall wurde sauber beendet." );
