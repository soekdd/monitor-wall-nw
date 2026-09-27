import {
	BrowserWindow, ipcMain, screen
} from "electron";

const controllers = new WeakMap();

function nativeFullscreen( win, enabled ) {
	if ( win.isFullScreen() === enabled ) {
		return Promise.resolve();
	}

	return new Promise( ( resolve, reject ) => {
		const event = enabled ? "enter-full-screen" : "leave-full-screen";

		const cleanup = () => {
			clearTimeout( timeout );win.removeListener( event, done );win.removeListener( "closed", closed );
		};

		const done = () => {
			cleanup();resolve();
		};

		const closed = () => {
			cleanup();reject( new Error( "Fenster wurde geschlossen." ) );
		};

		const timeout = setTimeout( () => {
			cleanup();reject( new Error( "Die Fensterumschaltung wurde nicht abgeschlossen." ) );
		}, 10000 );
		win.once( event, done );win.once( "closed", closed );win.setFullScreen( enabled );
	} );
}

async function fullscreen( win, enabled ) {
	if ( process.platform === "darwin" ) {
		// Stay on the current desktop and cover the complete display bounds.
		await nativeFullscreen( win, false );
		win.setSimpleFullScreen( enabled );
	} else {
		await nativeFullscreen( win, enabled );
	}
}

export function installWindowMode( win, { origin, config } ) {
	let saved, mode, pending = Promise.resolve();

	const setView = route => {
		pending = pending.catch( () => {} ).then( async() => {
			const url = new URL( route, origin );

			if ( url.origin !== origin || ![ "/wall", "/admin" ].includes( url.pathname ) ) {
				throw new Error( "Unbekannte Ansicht." );
			}

			const next = url.pathname === "/wall" ? "wall" : "admin";

			if ( next === mode ) {
				return;
			}

			if ( next === "wall" ) {
				saved = {
					bounds: win.getNormalBounds(), maximized: win.isMaximized(), menu: win.isMenuBarVisible()
				};
				const monitor = config().monitors.find( m => m.enabled && m.id === url.searchParams.get( "monitor" ) );
				const display = screen.getAllDisplays().find( d => String( d.id ) === monitor?.displayId ) || screen.getDisplayMatching( win.getBounds() );

				if ( win.isMaximized() ) {
					win.unmaximize();
				}

				if ( !win.isFullScreen() && !( process.platform === "darwin" && win.isSimpleFullScreen() ) ) {
					win.setBounds( display.bounds );
				}

				win.setMenuBarVisibility( false );
				await fullscreen( win, true );
			} else {
				await fullscreen( win, false );

				if ( saved ) {
					win.setBounds( saved.bounds );win.setMenuBarVisibility( saved.menu );

					if ( saved.maximized ) {
						win.maximize();
					}
				}
			}

			mode = next;
		} );
		return pending;
	};

	controllers.set( win, { origin, setView } );
	win.webContents.on( "before-input-event", ( event, input ) => {
		if ( input.type === "keyDown" && input.key === "Escape" && mode === "wall" ) {
			event.preventDefault();win.webContents.send( "wall:navigate", "/admin" );
		}
	} );
}

ipcMain.handle( "wall:set-view", ( event, route ) => {
	const controller = controllers.get( BrowserWindow.fromWebContents( event.sender ) );

	if ( !controller || event.senderFrame !== event.sender.mainFrame || new URL( event.senderFrame.url ).origin !== controller.origin || typeof route !== "string" ) {
		throw new Error( "Fenstersteuerung nicht erlaubt." );
	}

	return controller.setView( route );
} );
