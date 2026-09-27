const {
	app, BrowserWindow, Menu, clipboard, ClipboardItem, screen
} = require( "electron" );
const fs = require( "node:fs/promises" );
const path = require( "node:path" );
const assert = require( "node:assert/strict" );
app.on( "window-all-closed", () => {} );
app.whenReady().then( async() => {
	const { createWallServer } = await import( "../server/app.js" );
	const { fakePicker } = await import( "../tests/fixtures/google-picker.js" );
	const { editMenu, installEditingContextMenu } = await import( "../electron/editing.js" );
	const { installWindowMode } = await import( "../electron/window-mode.js" );
	const google = fakePicker();
	const directory = await fs.mkdtemp( "/private/tmp/wall-electron-" );
	let service, win;

	try {
		service = await createWallServer( {
			directory, host: "127.0.0.1", port: 0, dist: path.resolve( __dirname, "../dist" ), photosOptions: { fetchImpl: google.fetchImpl, now: google.nowFn }
		} );
		const config = structuredClone( service.store.config );config.widgets.forEach( w => w.enabled = [ "clock", "title" ].includes( w.type ) );await service.store.update( config );
		const base = `http://127.0.0.1:${service.server.address().port}`;
		win = new BrowserWindow( {
			width:          1440,
			height:         1080,
			show:           true,
			webPreferences: {
				contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, preload: path.resolve( __dirname, "../electron/preload.cjs" )
			}
		} );
		Menu.setApplicationMenu( Menu.buildFromTemplate( [ editMenu ] ) );
		installEditingContextMenu( win );
		installWindowMode( win, { origin: base, config: () => service.store.config } );
		const errors = [];win.webContents.on( "console-message", event => {
			if ( event.level === "error" ) {
				errors.push( event.message );
			}
		} );
		await win.loadURL( `${base}/admin#token=${service.token}` );
		const run = code => win.webContents.executeJavaScript( code );
		const isFullscreen = () => win.isFullScreen() || process.platform === "darwin" && win.isSimpleFullScreen();

		async function waitFor( code ) {
			const end = Date.now() + 10000;

			while ( Date.now() < end ) {
				if ( await run( code ) ) {
					return;
				}

				await new Promise( r => setTimeout( r, 100 ) );
			}

			throw Error( `UI not ready: ${code}` );
		}

		await waitFor( "document.body.innerText.includes('Schön, zu Hause zu sein.')" );
		await new Promise( r => setTimeout( r, 700 ) );
		assert.equal(
			await run( "document.querySelector('.sidebar').getBoundingClientRect().left>=0" ), true, "Desktop navigation must be visible"
		);
		await fs.writeFile( "/private/tmp/monitor-wall-desktop.png", ( await win.webContents.capturePage() ).toPNG() );
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.includes('Mediathek')).click()" );
		await waitFor( "document.body.innerText.includes('Momente, die bleiben.')" );
		assert.equal( await run( "document.querySelectorAll('.media-card').length" ), 5 );
		await run( "Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Szene hinzufügen')).click()" );
		await waitFor( "document.querySelector('.v-dialog.v-overlay--active')?.innerText.includes('Neue Szene')" );
		await run( "Array.from(document.querySelectorAll('.v-dialog.v-overlay--active button')).find(e=>e.innerText.includes('Abbrechen')).click()" );
		await waitFor( "!document.querySelector('.v-dialog.v-overlay--active')" );
		await new Promise( r => setTimeout( r, 400 ) );
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.includes('Informationen')).click()" );
		await waitFor( "document.querySelectorAll('.widget-grid>.v-card').length===9" );
		await run( "Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Konfigurieren')).click()" );
		await waitFor( "document.querySelector('.v-dialog.v-overlay--active')?.innerText.includes('Informationsmodul konfigurieren')" );
		await run( "Array.from(document.querySelectorAll('.v-dialog.v-overlay--active button')).find(e=>e.innerText.includes('Abbrechen')).click()" );
		await waitFor( "!document.querySelector('.v-dialog.v-overlay--active')" );
		await new Promise( r => setTimeout( r, 400 ) );
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.trim()==='Einstellungen').click()" );
		await waitFor( "document.body.innerText.includes('Mobile Fernsteuerung')" );
		await run( "(()=>{const input=Array.from(document.querySelectorAll('input')).find(e=>e.value==='Unsere Bilderwand');input.value='Test Zuhause';input.dispatchEvent(new Event('input',{bubbles:true}));Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Einstellungen speichern')).click();})()" );
		await waitFor( "document.body.innerText.includes('Gespeichert')" );
		assert.equal(
			service.store.config.name, "Test Zuhause", "Settings save must reach backend"
		);
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.includes('Übersicht')).click()" );
		await waitFor( "document.body.innerText.includes('Schön, zu Hause zu sein.')" );
		win.setSize( 390, 844 );await new Promise( r => setTimeout( r, 500 ) );
		await fs.writeFile( "/private/tmp/monitor-wall-mobile.png", ( await win.webContents.capturePage() ).toPNG() );
		assert.equal(
			await run( "document.documentElement.scrollWidth<=window.innerWidth" ), true, "Mobile horizontal overflow"
		);
		const historyLength = await run( "history.length" );
		const adminBounds = win.getBounds(), displayBounds = screen.getDisplayMatching( adminBounds ).bounds;
		assert.equal(
			await run( "(async()=>{window.__navigationSentinel=true;const button=Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Bilderwand öffnen'));button.click();button.click();await Promise.resolve();return button.classList.contains('v-btn--loading')&&button.disabled;})()" ), true, "Navigation immediately shows a spinner and disables repeated clicks"
		);
		await waitFor( "document.querySelector('.wall-world')&&document.querySelector('.scene-layer')" );
		await waitFor( "location.pathname==='/wall'" );
		assert.equal(
			isFullscreen(), true, "Wall must enter native fullscreen"
		);
		assert.deepEqual(
			win.getBounds(), displayBounds, "Wall must fill the physical display at its top-left corner"
		);
		assert.equal(
			await run( "window.__navigationSentinel&&history.length===" + ( historyLength + 1 ) ), true, "A repeated click switches once without reloading"
		);
		assert.equal( await run( "document.querySelectorAll('.monitor-overlay').length" ), 4 );
		await run( "document.querySelector('.wall-pulldown button').click()" );
		await waitFor( "Array.from(document.querySelectorAll('button')).some(e=>e.innerText.includes('Verwaltung öffnen')&&!e.disabled)" );
		assert.equal(
			await run( "(async()=>{const button=Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Verwaltung öffnen'));button.click();await Promise.resolve();return button.classList.contains('v-btn--loading')&&button.disabled;})()" ), true, "Return navigation also shows a spinner"
		);
		await waitFor( "document.body.innerText.includes('Schön, zu Hause zu sein.')" );
		assert.equal(
			isFullscreen(), false, "Administration must leave native fullscreen"
		);
		assert.deepEqual(
			win.getBounds(), adminBounds, "Administration must restore its previous position and size"
		);
		assert.equal(
			await run( "window.__navigationSentinel&&location.pathname==='/admin'" ), true, "Return to administration keeps the same document"
		);
		await run( "history.back()" );
		await waitFor( "location.pathname==='/wall'&&!!document.querySelector('.fullscreen-wall')" );
		assert.equal(
			isFullscreen(), true, "History back must also enter native fullscreen"
		);
		await waitFor( "!document.querySelector('[aria-busy=true]')" );
		await new Promise( resolve => setTimeout( resolve, 100 ) );
		await run( "history.forward()" );
		await waitFor( "location.pathname==='/admin'&&!!document.querySelector('.admin-content')" );
		assert.equal(
			isFullscreen(), false, "History forward must restore the administration window"
		);
		assert.deepEqual( win.getBounds(), adminBounds );
		await waitFor( "!document.querySelector('[aria-busy=true]')" );
		await run( "Array.from(document.querySelectorAll('button')).find(e=>e.innerText.includes('Bilderwand öffnen')).click()" );
		await waitFor( "location.pathname==='/wall'&&!document.querySelector('[aria-busy=true]')" );
		win.webContents.sendInputEvent( { type: "keyDown", keyCode: "Escape" } );
		win.webContents.sendInputEvent( { type: "keyUp", keyCode: "Escape" } );
		await waitFor( "location.pathname==='/admin'&&!!document.querySelector('.admin-content')" );
		assert.equal(
			isFullscreen(), false, "Escape must return to administration and leave fullscreen"
		);
		assert.deepEqual( win.getBounds(), adminBounds );
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.includes('API-Einstellungen')).click()" );
		await waitFor( "document.querySelectorAll('.api-card').length===9" );
		assert.equal(
			await run( "document.querySelectorAll('.oauth-setup').length" ), 0, "OAuth form starts collapsed in central API settings"
		);
		await run( "Array.from(document.querySelectorAll('[data-api-id=\"google-ambient\"] button')).find(e=>e.innerText.trim()==='OAuth einrichten').click()" );
		await waitFor( "document.querySelector('.oauth-setup input')===document.activeElement" );
		await run( "Array.from(document.querySelectorAll('[data-api-id=\"google-ambient\"] button')).find(e=>e.innerText.includes('OAuth-Einrichtung schließen')).click()" );
		await waitFor( "!document.querySelector('.oauth-setup')" );
		await run( "Array.from(document.querySelectorAll('[data-api-id=\"google-ambient\"] button')).find(e=>e.innerText.trim()==='OAuth einrichten').click()" );
		await waitFor( "!!document.querySelector('.oauth-setup')" );
		const savedClipboard = await Promise.all( ( await clipboard.read() ).map( async item =>
			new ClipboardItem( Object.fromEntries( await Promise.all( item.types.map( async type => [ type, await item.getType( type ) ] ) ) ) ) ) );
		const originalPopup = Menu.prototype.popup;

		try {
			const pasteItem = Menu.getApplicationMenu().items[ 0 ].submenu.items.find( item => item.role === "paste" );
			assert.ok( pasteItem, "Application menu must provide the native paste role and shortcut" );
			await run( "document.querySelector('.oauth-setup input').focus()" );
			await clipboard.writeText( "test.apps.googleusercontent.com" );
			win.webContents.paste();
			await waitFor( "document.querySelector('.oauth-setup input').value==='test.apps.googleusercontent.com'" );
			await run( "document.querySelectorAll('.oauth-setup input')[1].focus()" );
			await clipboard.writeText( "private-client" );
			let contextMenu;

			Menu.prototype.popup = function( options ) {
				assert.equal( options.window, win );contextMenu = this;
			};

			await run( "document.querySelectorAll('.oauth-setup input')[1].scrollIntoView({block:'center',behavior:'instant'})" );
			await new Promise( resolve => setTimeout( resolve, 300 ) );
			const rect = await run( "(()=>{const r=document.querySelectorAll('.oauth-setup input')[1].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()" );
			win.webContents.sendInputEvent( {
				type: "mouseDown", button: "right", clickCount: 1, ...rect
			} );
			win.webContents.sendInputEvent( {
				type: "mouseUp", button: "right", clickCount: 1, ...rect
			} );
			const deadline = Date.now() + 5000;

			while ( !contextMenu && Date.now() < deadline ) {
				await new Promise( resolve => setTimeout( resolve, 50 ) );
			}

			assert.ok( contextMenu, "Right-clicking the secret field must open an editing menu" );
			const contextPaste = contextMenu.items.find( item => item.role === "paste" );
			assert.equal(
				contextPaste?.enabled, true, "Paste must be available in password fields"
			);
			win.webContents.paste();
			await waitFor( "document.querySelectorAll('.oauth-setup input')[1].value==='private-client'" );
		} finally {
			Menu.prototype.popup = originalPopup;
			await clipboard.write( savedClipboard );
		}

		await run( "Array.from(document.querySelectorAll('.oauth-setup button')).find(e=>e.innerText.includes('OAuth-Einrichtung speichern')).click()" );
		await waitFor( "!document.querySelector('.oauth-setup')&&document.querySelector('[data-api-id=\"google-ambient\"]')?.innerText.includes('Mit Google verbinden')" );
		assert.equal( service.store.secrets.apis[ "google-ambient" ].clientId, "test.apps.googleusercontent.com" );
		assert.equal( service.store.secrets.apis[ "google-ambient" ].clientSecret, "private-client" );
		const galleryScene = {
			id: "cloud-gallery", apiId: "google-ambient", title: "Familienalbum aus Google", type: "google-photos", category: "Familie", sources: [], enabled: true, weight: 3, seasons: [], hours: [], scrollSeconds: 90
		};
		await service.store.update( { ...service.store.config, scenes: [ ...service.store.config.scenes, galleryScene ] } );
		await win.loadURL( `${base}/wall#token=${service.token}` );
		await waitFor( "!!document.querySelector('.wall-world')" );
		await service.connections.saveSecrets( "google-ambient", { refreshToken: "private-refresh" } );
		await service.photos.connectScene( galleryScene );await service.photos.refresh( galleryScene );service.broadcast();
		await run( `fetch('/api/control',{method:'POST',headers:{Authorization:'Bearer ${service.token}','Content-Type':'application/json'},body:JSON.stringify({action:'select',id:'cloud-gallery'})}).then(r=>r.json())` );
		await waitFor( "document.querySelectorAll('.stack-monitor').length===4&&document.querySelectorAll('.stack-monitor img').length===100" );
		await waitFor( "Array.from(document.querySelectorAll('.stack-monitor img')).every(img=>img.complete&&img.naturalWidth>0)" );
		await win.loadURL( `${base}/admin#token=${service.token}` );
		await waitFor( "document.body.innerText.includes('Schön, zu Hause zu sein.')" );
		await run( "Array.from(document.querySelectorAll('.v-list-item')).find(e=>e.innerText.includes('Mediathek')).click()" );
		await waitFor( "document.querySelectorAll('.media-card').length===6" );
		await run( "Array.from(document.querySelectorAll('.media-card')).find(e=>e.innerText.includes('Familienalbum aus Google')).querySelector('.media-image').click()" );
		await waitFor( "document.querySelector('.google-gallery')?.innerText.includes('Alben bei Google auswählen')" );
		assert.equal(
			await run( "document.querySelectorAll('.google-gallery input[type=password]').length" ), 0, "Scene editors must not duplicate OAuth setup"
		);
		await new Promise( r => setTimeout( r, 500 ) );
		await fs.writeFile( "/private/tmp/monitor-wall-google-gallery.png", ( await win.webContents.capturePage() ).toPNG() );

		await service.connections.saveSecrets( "google-picker", {
			clientId: "test.apps.googleusercontent.com", clientSecret: "private-client", refreshToken: "private-picker-refresh"
		} );
		const pickerScene = {
			...galleryScene, id: "picked-gallery", apiId: "google-picker", title: "Urlaubsfotos importieren", type: "google-picker", sources: []
		};
		await service.store.update( { ...service.store.config, scenes: [ ...service.store.config.scenes, pickerScene ] } );service.broadcast();
		await run( "Array.from(document.querySelectorAll('.v-dialog.v-overlay--active button')).find(e=>e.innerText.includes('Abbrechen')).click()" );
		await waitFor( "!document.querySelector('.v-dialog.v-overlay--active')" );
		await waitFor( "document.querySelectorAll('.media-card').length===7" );
		await run( "Array.from(document.querySelectorAll('.media-card')).find(e=>e.innerText.includes('Urlaubsfotos importieren')).querySelector('.media-image').click()" );
		await waitFor( "document.querySelector('.google-picker')?.innerText.includes('Fotos bei Google auswählen')" );
		await run( "Array.from(document.querySelectorAll('.google-picker button')).find(e=>e.innerText.includes('Fotos bei Google auswählen')).click()" );
		await waitFor( "!!document.querySelector('.google-picker a[href=\"https://photos.google.com/picker/test\"]')" );
		google.selected = true;google.now += 5001;
		await waitFor( "Array.from(document.querySelectorAll('.google-picker button')).some(e=>e.innerText.includes('Ausgewählte Fotos importieren'))" );
		await run( "Array.from(document.querySelectorAll('.google-picker button')).find(e=>e.innerText.includes('Ausgewählte Fotos importieren')).click()" );
		await waitFor( "document.querySelector('.google-picker')?.innerText.includes('2 Fotos lokal verfügbar')" );
		assert.equal( service.store.config.scenes.find( s => s.id === "picked-gallery" ).sources.length, 2 );
		await new Promise( resolve => setTimeout( resolve, 400 ) );
		await fs.writeFile( "/private/tmp/monitor-wall-picker-import.png", ( await win.webContents.capturePage() ).toPNG() );
		await win.loadURL( `${base}/wall#token=${service.token}` );
		await waitFor( "!!document.querySelector('.wall-world')" );
		await run( `fetch('/api/control',{method:'POST',headers:{Authorization:'Bearer ${service.token}','Content-Type':'application/json'},body:JSON.stringify({action:'select',id:'picked-gallery'})}).then(r=>r.json())` );
		await waitFor( "document.querySelectorAll('.stack-monitor img').length===100&&Array.from(document.querySelectorAll('.stack-monitor img')).every(img=>img.complete&&img.naturalWidth>0&&img.src.includes('/media/google-picker-'))" );

		assert.deepEqual( errors, [] );
		console.log( "Electron UI smoke passed: desktop, mobile, media, widget dialog, settings, wall, central API settings, OAuth clipboard/context menu, Ambient gallery, Picker multi-photo import and image stacks." );
	} finally {
		win?.destroy();await service?.close();await fs.rm( directory, { recursive: true, force: true } );
	}

	app.quit();
} )
	.catch( error => {
		console.error( error );app.exit( 1 );
	} );
