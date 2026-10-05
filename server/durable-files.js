import path from "node:path";
import { randomUUID } from "node:crypto";
import {
	open, rename, rm
} from "node:fs/promises";

export async function syncFile( file ) {
	const handle = await open( file, "r" );

	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function syncDirectory( directory ) {
	// Windows cannot open directories for fsync. File fsync still provides the
	// strongest guarantee available there; Linux kiosk installs take this path.
	if ( process.platform === "win32" ) {
		return;
	}

	const handle = await open( directory, "r" );

	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function writeSynced(
	file, data, { flag = "wx", mode = 0o600 } = {}
) {
	const handle = await open(
		file, flag, mode
	);

	try {
		await handle.writeFile( data );
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function publishDurable(
	source, target, { syncSource = true, syncParent = true } = {}
) {
	if ( syncSource ) {
		await syncFile( source );
	}

	await rename( source, target );

	if ( syncParent ) {
		await syncDirectory( path.dirname( target ) );
	}
}

export async function writeDurable(
	target, data, { mode = 0o600, syncParent = true } = {}
) {
	const staging = `${target}.part-${process.pid}-${randomUUID()}`;

	try {
		await writeSynced(
			staging, data, { mode }
		);
		await publishDurable(
			staging, target, { syncSource: false, syncParent }
		);
	} finally {
		await rm( staging, { force: true } );
	}
}
