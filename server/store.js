import {
	mkdir, readFile, writeFile, rename
} from "node:fs/promises";
import path from "node:path";
import { configSchema } from "./schema.js";
import { defaults } from "./defaults.js";
import { migrateApis } from "./api-migration.js";
export class JsonStore {
	constructor( directory ) {
		this.directory = directory; this.queue = Promise.resolve();
	}
	async init() {
		await mkdir( path.join( this.directory, "media" ), { recursive: true } ); let raw;
		let access;

		try {
			access = JSON.parse( await readFile( path.join( this.directory, "config.json" ), "utf8" ) );
		} catch( e ) {
			if ( e.code !== "ENOENT" ) {
				throw new Error( `config.json ist ungültig: ${e.message}` );
			}

			access = { password: "123" };await this.atomic( "config.json", access );
		}

		if ( !access || typeof access !== "object" || Array.isArray( access ) || typeof access.password !== "string" || !access.password ) {
			throw new Error( "config.json ist ungültig: password muss eine nicht leere Zeichenkette sein." );
		}

		this.access = access;

		try {
			raw = JSON.parse( await readFile( path.join( this.directory, "settings.json" ), "utf8" ) ); configSchema.parse( raw );
		} catch( e ) {
			if ( e.code !== "ENOENT" ) {
				throw new Error( `settings.json ist ungültig: ${e.message}` );
			}

			raw = defaults();
		}

		let secrets;

		try {
			secrets = JSON.parse( await readFile( path.join( this.directory, "secrets.json" ), "utf8" ) );
		} catch( e ) {
			if ( e.code !== "ENOENT" ) {
				throw e;
			}

			secrets = {};
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
	async atomic( file, value ) {
		const dest = path.join( this.directory, file ); const temp = `${dest}.tmp`; await writeFile(
			temp, JSON.stringify(
				value, null, 2
			) + "\n", { mode: 0o600 }
		); await rename( temp, dest );
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
