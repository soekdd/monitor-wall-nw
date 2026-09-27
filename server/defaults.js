const scene = (
	id, title, type, sources, category
) => ( {
	id, title, type, sources, category, enabled: true, weight: 3, seasons: [], hours: [], scrollSeconds: 90
} );
const widget = (
	id, title, type, monitor, position, options = {}, enabled = false
) => ( {
	id, title, type, monitor, position, options, enabled, refreshSeconds: 60
} );

export function defaults() {
	return {
		version:         1,
		name:            "Unsere Bilderwand",
		intervalSeconds: 120,
		fadeSeconds:     2,
		brightness:      100,
		shuffle:         true,
		monitors:        Array.from( { length: 4 }, ( _, i ) => ( {
			id: `m${i + 1}`, name: `Monitor ${i + 1}`, displayId: null, x: i * 1600, y: 0, width: 1600, height: 900, enabled: true
		} ) ),
		scenes: [ scene(
			"alpine", "Stille in den Bergen", "panorama", [ "/demo/alpine.svg" ], "Natur"
		), scene(
			"coast", "Am Ende des Tages", "fit", [ "/demo/coast.svg" ], "Natur"
		), scene(
			"memories", "Kleine Augenblicke", "stack", [ "/demo/alpine.svg", "/demo/coast.svg", "/demo/forest.svg" ], "Erinnerungen"
		), scene(
			"forest", "Ein Spaziergang im Grünen", "panorama", [ "/demo/forest.svg" ], "Natur"
		), scene(
			"welcome", "Willkommen zu Hause", "html", [ "/demo/welcome.html" ], "HTML"
		) ],
		widgets: [ widget(
			"clock", "Datum & Uhrzeit", "clock", "m4", "bottom-right", {}, true
		), widget(
			"title", "Bildtitel", "title", "m4", "bottom-left", {}, true
		), widget(
			"weather", "Wetter in Dresden", "weather", "m3", "bottom-left", { latitude: 51.05, longitude: 13.74 }, true
		), widget(
			"transit", "Bus & Bahn", "transit", "m4", "top-right", {
				stop: "Fritz-Meinhard-Straße", minMinutes: 8, exclude: [], limit: 4
			}
		), widget(
			"school", "Vertretungsplan", "school", "m3", "top-center", { url: "", rows: [] }
		), widget(
			"mpd", "Gerade läuft", "mpd", "m2", "bottom-right", { host: "127.0.0.1", port: 6600 }
		), widget(
			"calendar", "Familienkalender", "calendar", "m1", "bottom-left", { calendarId: "primary", days: 7 }
		), widget(
			"cameras", "Kameras", "cameras", "m1", "top-left", { cameras: [] }
		), widget(
			"soccer", "Fußball", "soccer", "m2", "top-center", { league: "bl1", season: new Date().getFullYear() }
		) ]
	};
}
