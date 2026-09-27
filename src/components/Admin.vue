<script setup>
import {
	ref, computed, watch
} from "vue";
import {
	wall, action, save, request, mediaUrl, getToken, logout, sceneSources, createId
} from "../api";
import WallCanvas from "./WallCanvas.vue";
import GooglePhotosGallery from "./GooglePhotosGallery.vue";
import GooglePhotosPicker from "./GooglePhotosPicker.vue";
import ApiSettings from "./ApiSettings.vue";
import { apiTypeForScene } from "../../shared/api-types";
defineProps( { navigating: Boolean } );
const emit = defineEmits( [ "navigate" ] );
const tab = ref( "overview" ), drawer = ref( false ), busy = ref( false ), notice = ref( "" ), query = ref( "" ), filter = ref( "all" ), sceneDialog = ref( false ), editing = ref( null ), widgetDialog = ref( false ), widget = ref( null ), dialogError = ref( "" ), settings = ref( null ), monitorDraft = ref( [] ), uploadInput = ref(), uploadTarget = ref( null );
const urlDialog = ref( false ), panoramaUrl = ref( "" ), urlError = ref( "" ), downloading = ref( false );
const nav = [ {
	id: "overview", label: "Übersicht", icon: "mdi-view-dashboard-outline"
}, {
	id: "media", label: "Mediathek", icon: "mdi-image-multiple-outline"
}, {
	id: "widgets", label: "Informationen", icon: "mdi-widgets-outline"
}, {
	id: "monitors", label: "Monitore", icon: "mdi-monitor-multiple"
}, {
	id: "apis", label: "API-Einstellungen", icon: "mdi-api"
}, {
	id: "settings", label: "Einstellungen", icon: "mdi-cog-outline"
} ];
const types = [ {
	value: "stack", title: "Bilderstapel", icon: "mdi-image-multiple-outline"
}, {
	value: "panorama", title: "Scrollendes Panorama", icon: "mdi-panorama-horizontal-outline"
}, {
	value: "fit", title: "Passendes Bild", icon: "mdi-image-outline"
}, {
	value: "html", title: "HTML-Seite", icon: "mdi-code-tags"
}, {
	value: "google-photos", title: "Google Photos · Ambient-Galerie", icon: "mdi-google-photos"
}, {
	value: "google-picker", title: "Google Photos · Picker-Import", icon: "mdi-image-plus-outline"
} ];
const positions = [ { title: "Oben links", value: "top-left" }, { title: "Oben mittig", value: "top-center" }, { title: "Oben rechts", value: "top-right" }, { title: "Unten links", value: "bottom-left" }, { title: "Unten mittig", value: "bottom-center" }, { title: "Unten rechts", value: "bottom-right" } ];
const seasons = [ { title: "Frühling", value: "spring" }, { title: "Sommer", value: "summer" }, { title: "Herbst", value: "autumn" }, { title: "Winter", value: "winter" } ];
const dayPeriods = [
	{
		title: "früh · 0–10 Uhr", value: "early", start: 0, end: 10
	},
	{
		title: "mittags · 10–15 Uhr", value: "midday", start: 10, end: 15
	},
	{
		title: "abends · 15–20 Uhr", value: "evening", start: 15, end: 20
	},
	{
		title: "nachts · 20–24 Uhr", value: "night", start: 20, end: 24
	}
];
const selectedDayPeriods = computed( {
	get: () => dayPeriods.filter( period => editing.value?.hours.some( hour => hour >= period.start && hour < period.end ) ).map( period => period.value ),
	set: selected => {
		editing.value.hours = dayPeriods.filter( period => selected.includes( period.value ) ).flatMap( period => Array.from( { length: period.end - period.start }, ( _, index ) => period.start + index ) );
	}
} );
const widgetIcons = {
	clock: "mdi-clock-outline", title: "mdi-format-title", weather: "mdi-weather-partly-cloudy", transit: "mdi-bus", school: "mdi-school-outline", mpd: "mdi-music-note-outline", calendar: "mdi-calendar-outline", cameras: "mdi-cctv", soccer: "mdi-soccer"
};
const current = computed( () => wall.config.scenes.find( s => s.id === wall.state.currentId ) );
const scenes = computed( () => wall.config.scenes.filter( s => ( filter.value === "all" || s.type === filter.value ) && `${s.title} ${s.category}`.toLowerCase().includes( ( query.value || "" ).toLowerCase() ) ) );
const activeWidgets = computed( () => wall.config.widgets.filter( w => w.enabled ) );
const clone = x => JSON.parse( JSON.stringify( x ) );
watch( () => tab.value, () => {
	drawer.value = false;

	if ( tab.value === "settings" ) {
		settings.value = clone( wall.config );
	}

	if ( tab.value === "monitors" ) {
		monitorDraft.value = clone( wall.config.monitors );
	}
} );

async function commit( config, message = "Gespeichert" ) {
	busy.value = true;

	try {
		await save( config );notice.value = message;return true;
	} catch( e ) {
		wall.error = e.message;return false;
	} finally {
		busy.value = false;
	}
}

function editScene( s ) {
	editing.value = s ? clone( s ) : {
		id: createId(), title: "Neue Szene", type: "fit", category: "Eigene Bilder", sources: [], enabled: true, weight: 3, seasons: [], hours: [], scrollSeconds: 90
	};dialogError.value = "";sceneDialog.value = true;
}

async function saveScene() {
	if ( apiTypeForScene( editing.value.type ) && !editing.value.apiId ) {
		return dialogError.value = "Bitte eine API-Verbindung auswählen.";
	}

	if ( !editing.value.title.trim() ) {
		return dialogError.value = "Bitte einen Titel eingeben.";
	}

	if ( !editing.value.sources.length && ![ "google-photos", "google-picker" ].includes( editing.value.type ) ) {
		return dialogError.value = "Bitte Bilder hochladen oder eine Quelle eingeben.";
	}

	const config = clone( wall.config ), index = config.scenes.findIndex( s => s.id === editing.value.id );

	if ( index < 0 ) {
		config.scenes.push( clone( editing.value ) );
	} else {
		config.scenes[ index ] = clone( editing.value );
	}

	if ( await commit( config, "Szene gespeichert" ) && ![ "google-photos", "google-picker" ].includes( editing.value.type ) ) {
		sceneDialog.value = false;
	}
}

async function deleteScene() {
	const config = clone( wall.config );config.scenes = config.scenes.filter( s => s.id !== editing.value.id );

	if ( await commit( config, "Szene entfernt" ) ) {
		sceneDialog.value = false;
	}
}

function chooseFiles( target ) {
	uploadTarget.value = target;uploadInput.value.click();
}

async function upload( event ) {
	const files = [ ...event.target.files ];event.target.value = "";

	if ( !files.length ) {
		return;
	}

	busy.value = true;

	try {
		const data = new FormData();data.append( "type", uploadTarget.value === "editing" ? editing.value.type : files.length > 1 ? "stack" : "fit" );files.forEach( f => data.append( "files", f ) );const response = await request(
			"/upload", "POST", data
		);

		if ( uploadTarget.value === "editing" ) {
			editing.value.sources.push( ...response.sources );
		} else {
			editScene();editing.value.title = files[ 0 ].name.replace( /\.[^.]+$/, "" );editing.value.type = /\.html?$/i.test( files[ 0 ].name ) ? "html" : files.length > 1 ? "stack" : "fit";editing.value.sources = response.sources;
		}
	} catch( e ) {
		wall.error = e.message;
	} finally {
		busy.value = false;
	}
}

function enterPanoramaUrl() {
	panoramaUrl.value = "";urlError.value = "";urlDialog.value = true;
}

async function downloadPanorama() {
	const scene = editing.value;
	downloading.value = true;urlError.value = "";

	try {
		const response = await request(
			"/import-image", "POST", { url: panoramaUrl.value.trim(), type: scene.type }
		);
		scene.sources.push( ...response.sources );urlDialog.value = false;
	} catch( e ) {
		urlError.value = e.message;
	} finally {
		downloading.value = false;
	}
}

function addWidget() {
	editWidget( {
		id: createId(), title: "Vertretungsplan", type: "school", enabled: false, monitor: wall.config.monitors[ 0 ].id, position: "top-left", refreshSeconds: 60, options: { rows: [] }
	} );
}

function editWidget( w ) {
	widget.value = clone( w );dialogError.value = "";widgetDialog.value = true;
}

async function saveWidget() {
	if ( ![ "clock", "title" ].includes( widget.value.type ) && !widget.value.apiId ) {
		return dialogError.value = "Bitte eine API-Verbindung auswählen.";
	}

	widget.value.options = {};const config = clone( wall.config );const index = config.widgets.findIndex( w => w.id === widget.value.id );

	if ( index < 0 ) {
		config.widgets.push( clone( widget.value ) );
	} else {
		config.widgets[ index ] = clone( widget.value );
	}

	if ( await commit( config, "Informationsmodul gespeichert" ) ) {
		widgetDialog.value = false;
	}
}

async function toggleWidget( w, value ) {
	const config = clone( wall.config );config.widgets.find( x => x.id === w.id ).enabled = value;await commit( config );
}

function assignDisplay( m, id ) {
	const d = wall.displays.find( d => d.id === id );m.displayId = id;

	if ( d ) {
		m.width = d.bounds.width;m.height = d.bounds.height;m.x = d.bounds.x;m.y = d.bounds.y;
	}
}

function addMonitor() {
	monitorDraft.value.push( {
		id: createId(), name: `Monitor ${monitorDraft.value.length + 1}`, displayId: null, x: monitorDraft.value.reduce( ( n, m ) => Math.max( n, m.x + m.width ), 0 ), y: 0, width: 1600, height: 900, enabled: true
	} );
}

async function saveMonitors() {
	const config = clone( wall.config );config.monitors = clone( monitorDraft.value );

	if ( new Set( config.monitors.filter( m => m.displayId && m.enabled ).map( m => m.displayId ) ).size !== config.monitors.filter( m => m.displayId && m.enabled ).length ) {
		wall.error = "Ein physischer Bildschirm kann nur einem Monitor zugeordnet werden.";return;
	}

	await commit( config, "Monitorlayout gespeichert" );
}

async function saveSettings() {
	await commit( {
		...clone( wall.config ), name: settings.value.name, intervalSeconds: Number( settings.value.intervalSeconds ), fadeSeconds: Number( settings.value.fadeSeconds ), brightness: Number( settings.value.brightness ), shuffle: settings.value.shuffle
	} );
}

async function copyToken() {
	try {
		await navigator.clipboard.writeText( getToken() );notice.value = "Zugangscode kopiert";
	} catch {
		wall.error = "Kopieren ist nur in einem sicheren Browserkontext verfügbar.";
	}
}

function exportConfig() {
	const blob = new Blob( [ JSON.stringify(
								wall.config, null, 2
							) ], { type: "application/json" } ), url = URL.createObjectURL( blob ), a = document.createElement( "a" );a.href = url;a.download = "monitor-wall-settings.json";a.click();URL.revokeObjectURL( url );
}

async function importConfig( event ) {
	try {
		const file = event.target.files[ 0 ];

		if ( file ) {
			await commit( JSON.parse( await file.text() ), "Konfiguration importiert" );
		}
	} catch( e ) {
		wall.error = e.message;
	} finally {
		event.target.value = "";
	}
}

const sourceText = computed( {
	get: () => editing.value?.sources.join( "\n" ) || "",
	set: v => editing.value.sources = v.split( "\n" ).map( s => s.trim() )
		.filter( Boolean )
} );
const apiChoices = type => wall.config.apis.filter( a => a.type === type ).map( a => ( { title: a.title, value: a.id } ) );

function openApiSettings() {
	sceneDialog.value = false;widgetDialog.value = false;tab.value = "apis";
}

watch( () => editing.value?.type, type => {
	if ( !editing.value ) {
		return;
	}

	const expected = apiTypeForScene( type );

	if ( !expected ) {
		delete editing.value.apiId;return;
	}

	if ( !wall.config.apis.some( a => a.id === editing.value.apiId && a.type === expected ) ) {
		editing.value.apiId = wall.config.apis.find( a => a.type === expected )?.id;
	}
} );
watch( () => widget.value?.type, type => {
	if ( !widget.value ) {
		return;
	}

	if ( [ "clock", "title" ].includes( type ) ) {
		delete widget.value.apiId;return;
	}

	if ( !wall.config.apis.some( a => a.id === widget.value.apiId && a.type === type ) ) {
		widget.value.apiId = wall.config.apis.find( a => a.type === type )?.id;
	}
} );
watch( () => wall.config.scenes.find( s => s.id === editing.value?.id )?.sources, sources => {
	if ( editing.value?.type === "google-picker" && sources ) {
		editing.value.sources = clone( sources );
	}
} );
</script>
<template>
<v-layout>
	<v-navigation-drawer class="sidebar"
		:model-value="$vuetify.display.mdAndUp||drawer"
		:permanent="$vuetify.display.mdAndUp"
		width="252"
		@update:model-value="drawer=$event"
	>
		<a class="brand" href="/admin"><span class="brand-mark"><v-icon icon="mdi-view-dashboard-outline"/></span><span>monitor<span class="brand-light">wall</span><small>DEIN ZUHAUSE. IM BLICK.</small></span></a>
		<div class="nav-caption">ARBEITSPLATZ</div><v-list class="nav-list" nav><v-list-item v-for="item in nav"
			:key="item.id"
			:active="tab===item.id"
			color="primary"
			:prepend-icon="item.icon"
			:title="item.label"
			@click="tab=item.id"
		/></v-list>
		<template #append><div class="sidebar-bottom"><span class="status-dot" :class="{ offline:!wall.connected }"></span>{{wall.connected?'Bilderwand verbunden':'Verbindung unterbrochen'}}<small>Alle Einstellungen werden lokal gespeichert.</small><v-btn prepend-icon="mdi-logout"
			size="small"
			variant="text"
			@click="logout"
		>Abmelden</v-btn></div></template>
	</v-navigation-drawer>
	<v-main><div class="admin-content">
		<header class="topbar"><div class="d-flex align-center ga-3"><v-btn v-if="$vuetify.display.smAndDown"
			aria-label="Navigation öffnen"
			icon="mdi-menu"
			variant="text"
			@click="drawer=!drawer"
		/><span class="muted">Unser Zuhause</span><v-icon icon="mdi-chevron-right" size="16"/><span>{{nav.find(n=>n.id===tab)?.label}}</span></div><div class="d-flex align-center ga-3"><span class="connection-badge"><span class="status-dot" :class="{ offline:!wall.connected }"/>{{wall.connected?'Live':'Offline'}}</span><v-avatar color="surface-variant" size="34"><v-icon icon="mdi-home-outline" size="19"/></v-avatar></div></header>
		<div class="page-heading"><div><div class="eyebrow">{{tab==='overview'?'ALLES AN EINEM ORT':'DEINE BILDERWAND'}}</div><h1>{{ { overview:'Schön, zu Hause zu sein.',media:'Momente, die bleiben.',widgets:'Das Wichtigste im Blick.',monitors:'Raum für deine Bilder.',apis:'Verbindungen an einem Ort.',settings:'Ganz nach deinem Rhythmus.' }[tab] }}</h1><p class="muted">{{ { overview:'Deine Bilder. Dein Alltag. Eine Wand voller Leben.',media:'Verwalte Bilderstapel, Panoramen und deine Lieblingsseiten.',widgets:'Platziere Informationen genau dort, wo du sie brauchst.',monitors:'Verbinde deine Bildschirme zu einer gemeinsamen Leinwand.',apis:'API-Zugänge gemeinsam für Medien und Informationen nutzen.',settings:'Passe Wiedergabe und Fernsteuerung an dein Zuhause an.' }[tab] }}</p></div><v-btn v-if="tab==='media'"
			color="primary"
			prepend-icon="mdi-plus"
			@click="editScene()"
		>Szene hinzufügen</v-btn><v-btn v-else-if="tab==='widgets'"
			color="primary"
			prepend-icon="mdi-plus"
			@click="addWidget"
		>Modul hinzufügen</v-btn><v-btn v-else-if="tab==='overview'"
			:aria-busy="navigating"
			:disabled="navigating"
			:loading="navigating"
			prepend-icon="mdi-arrow-top-right"
			variant="outlined"
			@click="emit('navigate','/wall')"
		>Bilderwand öffnen</v-btn></div>
		<template v-if="tab==='overview'">
			<section class="preview-card"><div class="section-top"><div class="d-flex align-center ga-3"><span class="live-tag">LIVE-VORSCHAU</span><span class="muted">{{wall.config.monitors.filter(m=>m.enabled).length}} Monitore · eine Leinwand</span></div><v-icon color="secondary" icon="mdi-monitor-multiple"/></div><WallCanvas class="dashboard-preview" preview/><div class="playback-bar"><div class="scene-caption"><span class="tiny-label">JETZT AUF DER BILDERWAND</span><strong>{{current?.title||'Keine aktive Szene'}}</strong><span class="muted">{{types.find(t=>t.value===current?.type)?.title}} <span v-if="current">· {{current.category}}</span></span></div><div class="playback-buttons"><v-btn aria-label="Vorherige Szene"
				icon="mdi-skip-previous"
				variant="text"
				@click="action('previous')"
			/><v-btn :aria-label="wall.state.paused?'Abspielen':'Pausieren'"
				color="primary"
				:icon="wall.state.paused?'mdi-play':'mdi-pause'"
				@click="action('pause')"
			/><v-btn aria-label="Nächste Szene"
				icon="mdi-skip-next"
				variant="text"
				@click="action('next')"
			/></div><div class="rotation-status"><span class="status-dot" :class="{ offline:wall.state.paused }"/>{{wall.state.paused?'Wiedergabe pausiert':'Automatischer Bildwechsel'}}<small>Alle {{wall.config.intervalSeconds}} Sekunden</small></div></div></section>
			<div class="stat-grid"><div v-for="stat in [ { icon:'mdi-image-multiple-outline',value:wall.config.scenes.length,label:'Szenen in der Mediathek',sub:'Augenblicke für jeden Tag' },{ icon:'mdi-monitor-multiple',value:wall.config.monitors.filter(m=>m.enabled).length,label:'Aktive Monitore',sub:`${wall.displays.length} physische Displays erkannt` },{ icon:'mdi-widgets-outline',value:activeWidgets.length,label:'Informationsmodule',sub:'Dein Alltag auf einen Blick' } ]" :key="stat.label" class="stat-card"><v-icon color="secondary" :icon="stat.icon"/><div><strong>{{stat.value}}</strong><p>{{stat.label}}</p><small>{{stat.sub}}</small></div></div></div>
			<div class="overview-bottom"><section><div class="section-title"><h2>Deine Mediathek</h2><v-btn append-icon="mdi-arrow-right"
				color="primary"
				variant="text"
				@click="tab='media'"
			>Alle Szenen</v-btn></div><div class="mini-scenes"><button v-for="s in wall.config.scenes.slice(0,3)"
				:key="s.id"
				class="mini-scene"
				:class="{ selected:s.id===current?.id }"
				@click="action('select',s.id)"
			><img v-if="s.type!=='html'&&sceneSources(s)[0]" alt="" :src="mediaUrl(sceneSources(s)[0])"><div v-else class="scene-placeholder"><v-icon icon="mdi-code-tags"/></div><span>{{s.title}}</span><small>{{types.find(t=>t.value===s.type)?.title}}</small></button></div></section><section class="information-summary"><div class="section-title"><h2>Im Blick</h2><v-btn aria-label="Informationen verwalten"
				icon="mdi-arrow-top-right"
				size="small"
				variant="text"
				@click="tab='widgets'"
			/></div><div v-for="w in activeWidgets.slice(0,4)" :key="w.id" class="summary-row"><v-icon color="secondary" :icon="widgetIcons[w.type]"/><div><strong>{{w.title}}</strong><small>{{wall.config.monitors.find(m=>m.id===w.monitor)?.name}}</small></div><span class="module-status" :class="{ error:wall.widgets[w.id]?.status==='error' }">{{wall.widgets[w.id]?.status==='error'?'Prüfen':'Aktiv'}}</span></div></section></div>
		</template>
		<template v-if="tab==='media'"><div class="media-toolbar"><v-text-field v-model="query"
			clearable
			hide-details
			placeholder="Szenen durchsuchen …"
			prepend-inner-icon="mdi-magnify"
			@click:clear="query=''"
		/><v-select v-model="filter" hide-details :items="[ { title:'Alle Kategorien',value:'all' },...types ]"/><v-btn :loading="busy"
			prepend-icon="mdi-upload"
			variant="tonal"
			@click="chooseFiles('new')"
		>Bilder hochladen</v-btn></div><div class="media-grid"><v-card v-for="s in scenes" :key="s.id" class="media-card"><div class="media-image" @click="editScene(s)"><img v-if="sceneSources(s)[0]&&s.type!=='html'" alt="" :src="mediaUrl(sceneSources(s)[0])"><div v-else class="scene-placeholder"><v-icon :icon="types.find(t=>t.value===s.type)?.icon" size="56"/></div><span class="media-type">{{types.find(t=>t.value===s.type)?.title}}</span><span v-if="s.id===current?.id" class="media-current">Jetzt live</span></div><div class="pa-5"><div class="d-flex align-center justify-space-between"><h3>{{s.title}}</h3><v-btn aria-label="Szene bearbeiten"
			icon="mdi-pencil-outline"
			size="small"
			variant="text"
			@click="editScene(s)"
		/></div><p class="muted text-body-2">{{s.category}} · {{sceneSources(s).length}} {{s.type==='html'?'Seite(n)':'Bild(er)'}}</p><div class="d-flex justify-space-between align-center mt-4"><v-chip :color="s.enabled?'primary':undefined" size="small" variant="tonal">{{s.enabled?'Aktiv':'Deaktiviert'}}</v-chip><v-btn append-icon="mdi-play"
			color="primary"
			:disabled="!s.enabled||!sceneSources(s).length"
			variant="text"
			@click="action('select',s.id)"
		>Anzeigen</v-btn></div></div></v-card></div><div v-if="!scenes.length" class="empty-state"><v-icon icon="mdi-image-plus-outline" size="48"/><h3>Platz für neue Erinnerungen</h3><p>Bilder hochladen oder eine neue Szene anlegen.</p></div></template>
		<template v-if="tab==='widgets'"><div class="widget-grid"><v-card v-for="w in wall.config.widgets" :key="w.id" class="pa-6"><div class="d-flex justify-space-between align-center"><div class="module-icon"><v-icon :icon="widgetIcons[w.type]"/></div><v-switch :aria-label="`${w.title} aktivieren`"
			color="primary"
			density="compact"
			:disabled="busy"
			hide-details
			:model-value="w.enabled"
			@update:model-value="v=>toggleWidget(w,v)"
		/></div><h3 class="mt-5">{{w.title}}</h3><p class="muted mt-2">{{wall.config.monitors.find(m=>m.id===w.monitor)?.name}} · {{positions.find(p=>p.value===w.position)?.title}}</p><div class="module-message mt-4">{{w.enabled?(wall.widgets[w.id]?.error||([ 'clock','title' ].includes(w.type)?'Bereit':wall.widgets[w.id]?.status==='ok'?'Verbunden':'Wartet auf Daten')):'Ausgeblendet'}}</div><v-btn block
			class="mt-5"
			prepend-icon="mdi-tune"
			variant="tonal"
			@click="editWidget(w)"
		>Konfigurieren</v-btn></v-card></div></template>
		<ApiSettings v-if="tab==='apis'"/>
		<template v-if="tab==='monitors'"><v-alert class="mb-6"
			color="secondary"
			icon="mdi-information-outline"
			variant="tonal"
		>Die Koordinaten bilden die gemeinsame Leinwand. Ordne in Electron jedem Monitor einen erkannten Bildschirm zu. Im Browser steht die Gesamtvorschau zur Verfügung.</v-alert><div class="monitor-editor"><v-card v-for="m in monitorDraft" :key="m.id" class="pa-6"><div class="d-flex justify-space-between"><v-icon color="secondary" icon="mdi-monitor" size="36"/><v-switch v-model="m.enabled"
			color="primary"
			hide-details
			label="Aktiv"
		/></div><v-text-field v-model="m.name" class="mt-5" label="Name"/><v-select clearable
			item-title="name"
			item-value="id"
			:items="wall.displays"
			label="Physischer Bildschirm"
			:model-value="m.displayId"
			@update:model-value="id=>assignDisplay(m,id||null)"
		/><div class="coordinate-grid"><v-text-field v-for="key in [ 'x','y','width','height' ]"
			:key
			v-model.number="m[key]"
			:label="{ x:'X',y:'Y',width:'Breite',height:'Höhe' }[key]"
			suffix="px"
			type="number"
		/></div></v-card></div><div class="d-flex ga-3 mt-6"><v-btn :disabled="monitorDraft.length>=16"
			prepend-icon="mdi-plus"
			variant="tonal"
			@click="addMonitor"
		>Monitor hinzufügen</v-btn><v-btn color="primary"
			:loading="busy"
			prepend-icon="mdi-check"
			@click="saveMonitors"
		>Layout speichern</v-btn></div></template>
		<template v-if="tab==='settings'&&settings"><div class="settings-grid"><v-card class="pa-7"><h2 class="mb-6">Wiedergabe</h2><v-text-field v-model="settings.name" label="Name der Bilderwand"/><div class="coordinate-grid"><v-text-field v-model.number="settings.intervalSeconds"
			label="Bildwechsel"
			suffix="Sekunden"
			type="number"
		/><v-text-field v-model.number="settings.fadeSeconds"
			label="Überblendung"
			suffix="Sekunden"
			type="number"
		/></div><p class="mb-3">Helligkeit · {{settings.brightness}} %</p><v-slider v-model="settings.brightness"
			color="primary"
			max="100"
			min="10"
			step="1"
			thumb-label
		/><v-switch v-model="settings.shuffle" color="primary" label="Zufällige Auswahl nach Bildpriorität"/><v-btn color="primary"
			:loading="busy"
			prepend-icon="mdi-check"
			@click="saveSettings"
		>Einstellungen speichern</v-btn></v-card><div><v-card class="pa-7 mb-5"><h2>Mobile Fernsteuerung</h2><p class="muted my-4">Öffne diese Adresse auf deinem Smartphone im selben Netzwerk und melde dich mit dem Zugangscode an.</p><div v-for="address in wall.addresses" :key="address" class="address">{{address}}/admin</div><div v-if="!wall.addresses.length" class="muted">Kein Netzwerkinterface gefunden.</div><v-text-field class="mt-6"
			label="Zugangscode"
			:model-value="getToken()"
			readonly
			type="password"
		/><v-btn prepend-icon="mdi-content-copy" variant="tonal" @click="copyToken">Code kopieren</v-btn></v-card><v-card class="pa-7"><h2>JSON-Konfiguration</h2><p class="muted my-4">Exportiere Einstellungen und Medienreferenzen als Sicherung. Bilddateien und Zugangsdaten werden separat gespeichert.</p><div class="d-flex ga-3 flex-wrap"><v-btn prepend-icon="mdi-download" variant="tonal" @click="exportConfig">Exportieren</v-btn><v-btn prepend-icon="mdi-upload" tag="label" variant="tonal">Importieren<input accept="application/json"
			hidden
			type="file"
			@change="importConfig"
		></v-btn></div></v-card></div></div></template>
		<footer class="admin-footer"><span>Monitor Wall <span class="muted">/ Ein kleines Stück Zuhause.</span></span><span class="muted"><v-icon class="mr-2" icon="mdi-folder-outline" size="14"/>Lokal gespeichert · ohne Datenbank</span></footer>
	</div></v-main>
</v-layout>
<input ref="uploadInput"
	accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.html,.htm"
	hidden
	multiple
	type="file"
	@change="upload"
>
<v-dialog v-model="sceneDialog" max-width="700" scrollable><v-card><v-card-title class="pa-6">{{wall.config.scenes.some(s=>s.id===editing?.id)?'Szene bearbeiten':'Neue Szene'}}</v-card-title><v-card-text v-if="editing"><v-text-field v-model="editing.title" label="Titel"/><div class="coordinate-grid"><v-select v-model="editing.type" :items="types" label="Darstellung"/><v-text-field v-model="editing.category" label="Kategorie"/></div><div v-if="apiTypeForScene(editing.type)" class="mb-5"><v-select v-model="editing.apiId" :items="apiChoices(apiTypeForScene(editing.type))" label="API-Verbindung"/><v-btn size="small" variant="text" @click="openApiSettings">API-Einstellungen öffnen</v-btn></div><GooglePhotosPicker v-if="editing.type==='google-picker'"
	:key="editing.id+editing.apiId"
	:saved="wall.config.scenes.some(s=>s.id===editing.id&&s.type==='google-picker'&&s.apiId===editing.apiId)"
	:scene="editing"
	@imported="editing.sources=clone(wall.config.scenes.find(s=>s.id===editing.id)?.sources||[])"
/><GooglePhotosGallery v-if="editing.type==='google-photos'"
	:saved="wall.config.scenes.some(s=>s.id===editing.id&&s.type==='google-photos'&&s.apiId===editing.apiId)"
	:scene="editing"
	@source="id=>editing.googlePhotos={ mediaSourceId:id }"
/><v-textarea v-if="![ 'google-photos','google-picker' ].includes(editing.type)"
	v-model="sourceText"
	label="Quellen · eine URL pro Zeile"
	placeholder="/media/datei.jpg oder https://…"
	rows="3"
	variant="outlined"
/><v-btn v-if="![ 'google-photos','google-picker' ].includes(editing.type)"
	:loading="busy"
	prepend-icon="mdi-upload"
	variant="tonal"
	@click="chooseFiles('editing')"
>Dateien hinzufügen</v-btn><v-btn v-if="[ 'panorama','fit' ].includes(editing.type)"
	class="ml-3"
	:disabled="busy"
	prepend-icon="mdi-link"
	variant="tonal"
	@click="enterPanoramaUrl"
>Hier URL eintragen</v-btn><v-select v-model="editing.seasons"
	chips
	class="mt-6"
	:items="seasons"
	label="Jahreszeiten · leer = ganzjährig"
	multiple
/><v-select v-model="selectedDayPeriods"
	chips
	:items="dayPeriods"
	label="Tageszeiten · leer = jederzeit"
	multiple
/><div class="coordinate-grid"><v-select v-model="editing.weight" :items="[ 1,2,3,4,5 ]" label="Priorität"/><v-text-field v-model.number="editing.scrollSeconds"
	label="Panorama-Scrollzyklus"
	suffix="s"
	type="number"
/></div><v-switch v-model="editing.enabled"
	color="primary"
	hide-details
	label="In der Wiedergabe verwenden"
/><v-alert v-if="dialogError"
	class="mt-4"
	color="error"
	variant="tonal"
>{{dialogError}}</v-alert></v-card-text><v-card-actions class="pa-5"><v-btn v-if="wall.config.scenes.some(s=>s.id===editing?.id)" color="error" @click="deleteScene">Entfernen</v-btn><v-spacer/><v-btn @click="sceneDialog=false">Abbrechen</v-btn><v-btn color="primary"
	:loading="busy"
	variant="flat"
	@click="saveScene"
>Speichern</v-btn></v-card-actions></v-card></v-dialog>
<v-dialog v-model="urlDialog" max-width="550" :persistent="downloading"><v-card><v-card-title class="pa-6">Panorama herunterladen</v-card-title><v-card-text><v-text-field v-model="panoramaUrl"
	autofocus
	:disabled="downloading"
	label="Bild-URL"
	placeholder="https://…/panorama.jpg"
	type="url"
	@keydown.enter.prevent="!downloading && downloadPanorama()"
/><p class="muted">Direkten Link zur Bilddatei eintragen. Das Panorama wird lokal gespeichert.</p><v-alert v-if="urlError"
	class="mt-4"
	color="error"
	variant="tonal"
>{{urlError}}</v-alert></v-card-text><v-card-actions class="pa-5"><v-spacer/><v-btn :disabled="downloading" @click="urlDialog=false">Abbrechen</v-btn><v-btn color="primary"
	:disabled="!panoramaUrl.trim()"
	:loading="downloading"
	variant="flat"
	@click="downloadPanorama"
>Herunterladen</v-btn></v-card-actions></v-card></v-dialog>
<v-dialog v-model="widgetDialog" max-width="720" scrollable><v-card><v-card-title class="pa-6">Informationsmodul konfigurieren</v-card-title><v-card-text v-if="widget"><v-text-field v-model="widget.title" label="Titel"/><v-select v-model="widget.type" :items="Object.keys(widgetIcons).map(type=>({ value:type,title:{ clock:'Datum & Uhrzeit',title:'Bildtitel',weather:'Wetter',transit:'Bus & Bahn',school:'Vertretungsplan',mpd:'MPD',calendar:'Google Kalender',cameras:'Kameras',soccer:'Fußball' }[type] }))" label="Modultyp"/><div class="coordinate-grid"><v-select v-model="widget.monitor"
	item-title="name"
	item-value="id"
	:items="wall.config.monitors"
	label="Monitor"
/><v-select v-model="widget.position" :items="positions" label="Position"/></div><v-text-field v-model.number="widget.refreshSeconds"
	label="Aktualisierungsintervall"
	suffix="s"
	type="number"
/><div v-if="![ 'clock','title' ].includes(widget.type)"><v-select v-model="widget.apiId" :items="apiChoices(widget.type)" label="API-Verbindung"/><p class="muted mb-4">Dienstoptionen und Zugangsdaten werden gemeinsam unter API-Einstellungen gepflegt.</p><v-btn variant="text" @click="openApiSettings">API-Einstellungen öffnen</v-btn></div><v-switch v-model="widget.enabled" color="primary" label="Auf der Bilderwand anzeigen"/><v-alert v-if="dialogError" color="error" variant="tonal">{{dialogError}}</v-alert></v-card-text><v-card-actions class="pa-5"><v-spacer/><v-btn @click="widgetDialog=false">Abbrechen</v-btn><v-btn color="primary"
	:loading="busy"
	variant="flat"
	@click="saveWidget"
>Speichern</v-btn></v-card-actions></v-card></v-dialog>
<v-snackbar :model-value="!!notice" timeout="2500" @update:model-value="notice=''">{{notice}}</v-snackbar>
</template>
