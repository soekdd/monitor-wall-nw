import {
	app, BrowserWindow, screen, Menu, shell
} from "electron";
import {
	mkdirSync, rmSync, writeFileSync
} from "node:fs";
import path from "node:path";
import { googleLink } from "../server/google-photos.js";
import { createWallServer } from "../server/app.js";
import { editMenu, installEditingContextMenu } from "./editing.js";
import { displayName, findDisplay } from "./displays.js";
import { installWindowMode } from "./window-mode.js";
const windows = new Map();
const pidFile = path.join( app.getPath( "userData" ), "monitor-wall.pid" );

let service, admin, closing = false, showAdmin = () => {};

// Wayland does not let applications place top-level windows at screen
// coordinates. The wall therefore uses XWayland on Linux so that each
// fullscreen window can be moved to its assigned physical display first.
if ( process.platform === "linux" ) {
	// Electron's X11 GPU process crashes with the nouveau driver used by the
	// multi-output NVIDIA card. Software compositing is stable and can be
	// overridden after a driver change without another code modification.
	if ( process.env.WALL_ENABLE_GPU !== "1" ) {
		app.disableHardwareAcceleration();
	}
}

if ( !app.requestSingleInstanceLock() ) {
	console.log( "Monitor Wall läuft bereits; die vorhandene Instanz wird aktiviert." );
	app.quit();
} else {
	app.on( "second-instance", () => {
		showAdmin();
	} );
	app.whenReady().then( async() => {
		mkdirSync( path.dirname( pidFile ), { recursive: true } );
		writeFileSync(
			pidFile, `${process.pid}\n`, { mode: 0o600 }
		);
		const port = Number( process.env.WALL_PORT ) || 3210;
		const local = route => `http://127.0.0.1:${port}${route}#token=${service.token}`;

		const available = () => {
			const primaryId = screen.getPrimaryDisplay().id;

			return screen.getAllDisplays().map( d => ( {
				id: String( d.id ), name: displayName( d, primaryId ), bounds: d.bounds, scaleFactor: d.scaleFactor, primary: d.id === primaryId
			} ) );
		};

		function createWindow( options, route ) {
			const win = new BrowserWindow( {
				...options,
				webPreferences: {
					contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join( app.getAppPath(), "electron/preload.cjs" )
				}
			} );installEditingContextMenu( win );installWindowMode( win, { origin: `http://127.0.0.1:${port}`, config: () => service.store.config } );win.webContents.setWindowOpenHandler( ( { url } ) => {
				if ( googleLink( url ) ) {
					void shell.openExternal( url );
				}

				return { action: "deny" };
			} );win.webContents.on( "will-navigate", ( event, url ) => {
				if ( !url.startsWith( `http://127.0.0.1:${port}/` ) ) {
					event.preventDefault();
				}
			} );win.loadURL( local( route ) );return win;
		}

		function sync( config ) {
			const displays = screen.getAllDisplays();

			for ( const [ id, win ] of windows ) {
				const m = config.monitors.find( m => m.id === id && m.enabled );const d = findDisplay( displays, m );

				if ( !d ) {
					win.close();windows.delete( id );
				} else {
					win.setBounds( d.bounds );
				}
			}

			for ( const m of config.monitors.filter( m => m.enabled && m.displayId ) ) {
				const d = findDisplay( displays, m );

				if ( d && !windows.has( m.id ) ) {
					const win = createWindow( {
						...d.bounds, fullscreen: true, kiosk: true, frame: false, backgroundColor: "#000", autoHideMenuBar: true
					}, `/wall?monitor=${m.id}` );windows.set( m.id, win );win.on( "closed", () => windows.delete( m.id ) );
				}
			}
		}

		service = await createWallServer( {
			directory: process.env.WALL_DATA_DIR || path.join( app.getPath( "userData" ), "data" ), port, frontend: process.env.WALL_DEV === "1", dist: path.join( app.getAppPath(), "dist" ), googleCredentialsDirectory: path.join( app.getAppPath(), "config" ), googleCredentialsFile: process.env.WALL_GOOGLE_OAUTH_FILE, googlePickerCredentialsFile: process.env.WALL_GOOGLE_PICKER_OAUTH_FILE, displays: available, onDisplays: sync
		} );

		showAdmin = () => {
			if ( !admin ) {
				admin = createWindow( {
					width: 1440, height: 960, minWidth: 420, minHeight: 640, backgroundColor: "#101617"
				}, "/admin" );admin.on( "closed", () => {
					admin = null;
				} );
			}

			admin.show();admin.focus();admin.webContents.send( "wall:navigate", "/admin" );
		};

		showAdmin();sync( service.store.config );
		console.log( `Monitor Wall läuft auf Port ${service.server.address().port} mit ${windows.size} Bilderwandfenstern.` );
		Menu.setApplicationMenu( Menu.buildFromTemplate( [ {
			label:   "Monitor Wall",
			submenu: [ { label: "Verwaltung", click: showAdmin }, {
				label: "Bilderwand starten",
				click: () => {
					sync( service.store.config );admin?.webContents.send( "wall:navigate", "/wall" );
				}
			}, { type: "separator" }, { role: "quit" } ]
		}, editMenu, { label: "Ansicht", submenu: [ { role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" } ] } ] ) );

		for ( const e of [ "display-added", "display-removed", "display-metrics-changed" ] ) {
			screen.on( e, () => {
				sync( service.store.config );service.broadcast();
			} );
		}
	} )
		.catch( error => {
			console.error( error );app.quit();
		} );
	app.on( "window-all-closed", () => app.quit() );
	process.once( "SIGTERM", () => app.quit() );
	app.on( "will-quit", () => rmSync( pidFile, { force: true } ) );
	app.on( "before-quit", event => {
		if ( service && !closing ) {
			event.preventDefault();closing = true;service.close().finally( () => app.quit() );
		}
	} );
}
