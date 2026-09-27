const { contextBridge, ipcRenderer } = require( "electron" );

contextBridge.exposeInMainWorld( "wallDesktop", {
	setView:    route => ipcRenderer.invoke( "wall:set-view", route ),
	onNavigate: callback => {
		const listener = ( _event, route ) => callback( route );
		ipcRenderer.on( "wall:navigate", listener );
		return () => ipcRenderer.removeListener( "wall:navigate", listener );
	}
} );
