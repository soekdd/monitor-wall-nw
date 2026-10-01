import { spawn } from "node:child_process";
import electron from "electron";
const env = { ...process.env, WALL_DEV: "1" };delete env.ELECTRON_RUN_AS_NODE;
const args = process.platform === "linux" ? [ "--ozone-platform=x11", "--log-level=3", "." ] : [ "." ];
const child = spawn(
	electron, args, { stdio: "inherit", env }
);child.on( "exit", code => process.exit( code || 0 ) );
