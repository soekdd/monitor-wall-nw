import { spawn } from "node:child_process";
import electron from "electron";

const env = { ...process.env };delete env.ELECTRON_RUN_AS_NODE;
const args = process.platform === "linux" ? [ "--ozone-platform=x11", "--log-level=3", "." ] : [ "." ];
const child = spawn(
	electron, args, {
		stdio: "ignore", env, detached: true, windowsHide: true
	}
);

await new Promise( ( resolve, reject ) => {
	child.once( "spawn", resolve );child.once( "error", reject );
} );child.unref();console.log( `Monitor Wall wurde im Hintergrund gestartet (PID ${child.pid}).` );
