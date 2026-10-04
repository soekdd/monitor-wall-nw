import { spawn } from "node:child_process";

const unit = "monitor-wall.service";
const messages = {
	start:   "Monitor Wall wurde über systemd gestartet.",
	stop:    "Monitor Wall wurde über systemd beendet.",
	restart: "Monitor Wall wurde über systemd neu gestartet."
};

export async function controlService( action ) {
	if ( process.platform !== "linux" ) {
		throw new Error( "Die systemd-Steuerung ist nur auf dem Linux-Kiosk verfügbar." );
	}

	if ( !Object.hasOwn( messages, action ) ) {
		throw new Error( `Unbekannte Dienstaktion: ${action}` );
	}

	const child = spawn(
		"systemctl", [ "--user", action, unit ], { stdio: "inherit" }
	);

	await new Promise( ( resolve, reject ) => {
		child.once( "error", reject );
		child.once( "exit", ( code, signal ) => {
			if ( code === 0 ) {
				resolve();
			} else {
				reject( new Error( signal ? `systemctl wurde durch ${signal} beendet.` : `systemctl wurde mit Status ${code} beendet.` ) );
			}
		} );
	} );

	console.log( messages[ action ] );
}
