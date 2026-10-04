import {
	mkdir, readFile, rm
} from "node:fs/promises";
import path from "node:path";
import { configSchema } from "./schema.js";
import { defaults } from "./defaults.js";
import { migrateApis } from "./api-migration.js";
import {
	publishDurable, writeDurable, writeSynced
} from "./durable-files.js";

function parseJson( file, text ) {
	const value = JSON.parse( text );

	if ( file === "settings.json" ) {
		configSchema.parse( value );
	} else if ( file === "config.json" && ( !value || typeof value !== "object" || Array.isArray( value ) || typeof value.password !== "string" || !value.password ) ) {
		throw new Error( "password muss eine nicht leere Zeichenkette sein." );
	} else if ( file === "secrets.json" && ( !value || typeof value !== "object" || Array.isArray( value ) ) ) {
		throw new Error( "der Inhalt muss ein Objekt sein." );
	}

	return value;
}

export class JsonStore {
	constructor( directory ) {
		this.directory = directory; this.queue = Promise.resolve();
	}
	async init() {
		await mkdir( path.join( this.directory, "media" ), { recursive: true } );
		const loadedAccess = await this.load( "config.json" );
		const access = loadedAccess.missing ? { password: "123" } : loadedAccess.value;

		if ( loadedAccess.missing ) {
			await this.atomic(
				"config.json", access, { backup: false }
			);
		}

		this.access = access;
		const loadedSettings = await this.load( "settings.json" );
		const raw = loadedSettings.missing ? defaults() : loadedSettings.value;

		if ( loadedSettings.missing ) {
			await this.atomic(
				"settings.json", raw, { backup: false }
			);
		}

		const loadedSecrets = await this.load( "secrets.json" );
		const secrets = loadedSecrets.missing ? {} : loadedSecrets.value;

		if ( loadedSecrets.missing ) {
			await this.atomic(
				"secrets.json", secrets, { backup: false }
			);
		}

		const migrated = migrateApis( raw, secrets ), migratedSecrets = { ...migrated.secrets };delete migratedSecrets.adminToken;this.config = configSchema.parse( migrated.config );this.secrets = migratedSecrets;

		if ( JSON.stringify( secrets ) !== JSON.stringify( this.secrets ) ) {
			await this.atomic( "secrets.json", this.secrets );
		}

		if ( JSON.stringify( raw ) !== JSON.stringify( this.config ) ) {
			await this.atomic( "settings.json", this.config );
		}

		return this;
	}
	async load( file ) {
		const primary = path.join( this.directory, file ), backup = `${primary}.bak`;
		const recoverable = file === "settings.json" || file === "secrets.json";
		let primaryError, recovered, text, value;

		try {
			text = await readFile( primary, "utf8" );value = parseJson( file, text );
		} catch( error ) {
			primaryError = error;
		}

		if ( !primaryError ) {
			if ( !recoverable ) {
				return { value, missing: false };
			}

			try {
				parseJson( file, await readFile( backup, "utf8" ) );
			} catch( error ) {
				if ( error.code && error.code !== "ENOENT" ) {
					throw error;
				}

				await writeDurable( backup, text );
			}

			return { value, missing: false };
		}

		if ( !recoverable ) {
			if ( primaryError.code === "ENOENT" ) {
				return { missing: true };
			}

			throw new Error( `${file} ist ungültig: ${primaryError.message}` );
		}

		try {
			recovered = parseJson( file, await readFile( backup, "utf8" ) );
		} catch( backupError ) {
			if ( primaryError.code === "ENOENT" && backupError.code === "ENOENT" ) {
				return { missing: true };
			}

			const reason = primaryError.code === "ENOENT" ? backupError : primaryError;

			throw new Error( `${file} ist ungültig: ${reason.message}` );
		}

		await this.atomic(
			file, recovered, { backup: false }
		);
		console.warn( `${file} wurde aus ${path.basename( backup )} wiederhergestellt.` );
		return {
			value: recovered, missing: false, recovered: true
		};
	}
	async atomic(
		file, value, { backup = true } = {}
	) {
		const dest = path.join( this.directory, file ), temp = `${dest}.tmp-${process.pid}`;
		const serialized = JSON.stringify(
			value, null, 2
		) + "\n";

		try {
			await writeSynced(
				temp, serialized, { flag: "w", mode: 0o600 }
			);

			if ( backup && ( file === "settings.json" || file === "secrets.json" ) ) {
				let previous;

				try {
					previous = await readFile( dest, "utf8" );
				} catch( error ) {
					if ( error.code !== "ENOENT" ) {
						throw error;
					}
				}

				try {
					if ( previous !== undefined ) {
						parseJson( file, previous );
					}
				} catch {
					previous = undefined;
				}

				if ( previous !== undefined ) {
					await writeDurable( `${dest}.bak`, previous );
				}
			}

			await publishDurable( temp, dest );

			if ( !backup && ( file === "settings.json" || file === "secrets.json" ) ) {
				await writeDurable( `${dest}.bak`, serialized );
			}
		} finally {
			await rm( temp, { force: true } );
		}
	}
	update( config ) {
		const parsed = configSchema.parse( config );

		if ( !( "apis" in config ) ) {
			delete parsed.apis;
		}

		const op = this.queue.then( async() => {
			const migrated = migrateApis( parsed, this.secrets );const next = configSchema.parse( migrated.config );

			if ( JSON.stringify( this.secrets ) !== JSON.stringify( migrated.secrets ) ) {
				await this.atomic( "secrets.json", migrated.secrets );this.secrets = migrated.secrets;
			}

			await this.atomic( "settings.json", next );this.config = next;return next;
		} ); this.queue = op.catch( () => {} ); return op;
	}
	updateSecrets( update ) {
		const op = this.queue.then( async() => {
			const secrets = update( this.secrets );await this.atomic( "secrets.json", secrets );this.secrets = secrets;
		} );this.queue = op.catch( () => {} );return op;
	}
	saveSecrets( secrets ) {
		const op = this.queue.then( async() => {
			await this.atomic( "secrets.json", secrets );this.secrets = secrets;
		} );this.queue = op.catch( () => {} );return op;
	}
	modifyConfig( update ) {
		const op = this.queue.then( async() => {
			const config = configSchema.parse( update( structuredClone( this.config ) ) );await this.atomic( "settings.json", config );this.config = config;return config;
		} );this.queue = op.catch( () => {} );return op;
	}
}
