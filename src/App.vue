<script setup>
import {
	ref, onMounted, onUnmounted, nextTick
} from "vue";
import {
	wall, connect, action, sceneSources
} from "./api";
import Admin from "./components/Admin.vue";
import WallCanvas from "./components/WallCanvas.vue";
const isWall = ref( location.pathname === "/wall" ), monitor = ref( new URLSearchParams( location.search ).get( "monitor" ) );
const token = ref( "" ), loading = ref( false ), loginError = ref( "" ), menu = ref( false );
const navigating = ref( false );
const painted = () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) );

function syncRoute() {
	isWall.value = location.pathname === "/wall";
	monitor.value = new URLSearchParams( location.search ).get( "monitor" );
	menu.value = false;
}

async function navigate( route, updateHistory = true ) {
	if ( navigating.value ) {
		return;
	}

	navigating.value = true;

	try {
		await nextTick();
		await painted();
		await window.wallDesktop?.setView( route );

		if ( updateHistory ) {
			history.pushState(
				null, "", route
			);
		}

		syncRoute();
		await nextTick();
		await painted();
	} catch( error ) {
		wall.error = error.message;
	} finally {
		navigating.value = false;
	}
}

const popRoute = () => navigate( location.pathname + location.search, false );
let stopDesktopNavigation;
onMounted( () => {
	window.addEventListener( "popstate", popRoute );
	stopDesktopNavigation = window.wallDesktop?.onNavigate( route => navigate( route ) );
} );
onUnmounted( () => {
	window.removeEventListener( "popstate", popRoute );stopDesktopNavigation?.();
} );

async function login() {
	loading.value = true;loginError.value = "";

	try {
		await connect( token.value || undefined );
	} catch( e ) {
		loginError.value = e.message;
	} finally {
		loading.value = false;
	}
}

onMounted( async() => {
	try {
		await connect();
	} catch {}

	try {
		await window.wallDesktop?.setView( location.pathname + location.search );
	} catch( error ) {
		wall.error = error.message;
	}
} );
</script>
<template>
<v-app :aria-busy="navigating">
	<div v-if="!wall.authenticated" class="login-shell"><v-card class="login-card" width="440"><div class="brand-mark"><v-icon icon="mdi-view-dashboard-outline"/></div><div class="eyebrow mt-8">MONITOR WALL</div><h1 class="mt-3">Ein Zuhause für<br>deine Augenblicke.</h1><p class="muted mt-4 mb-7">Verbinde dich mit deiner Bilderwand. Den Zugangscode findest du in der lokalen Verwaltung oder beim Start im Terminal.</p><form @submit.prevent="login"><v-text-field v-model="token"
		autocomplete="current-password"
		:error-messages="loginError"
		label="Zugangscode"
		type="password"
	/><v-btn block
		color="primary"
		:loading
		size="large"
		type="submit"
	>Mit der Bilderwand verbinden <v-icon end icon="mdi-arrow-right"/></v-btn></form></v-card></div>
	<template v-else-if="isWall"><WallCanvas class="fullscreen-wall" :monitor/><div class="wall-pulldown"><v-menu v-model="menu" :close-on-content-click="false" location="bottom"><template #activator="{ props }"><v-btn v-bind="props"
		aria-label="Bilderwand steuern"
		prepend-icon="mdi-chevron-down"
		variant="tonal"
	>Bilderwand</v-btn></template><v-card class="pa-5" width="340"><h3 class="mb-4">{{wall.config.name}}</h3><div class="d-flex ga-2 mb-4"><v-btn aria-label="Vorheriges Bild" icon="mdi-skip-previous" @click="action('previous')"/><v-btn :aria-label="wall.state.paused?'Abspielen':'Pausieren'" :icon="wall.state.paused?'mdi-play':'mdi-pause'" @click="action('pause')"/><v-btn aria-label="Nächstes Bild" icon="mdi-skip-next" @click="action('next')"/></div><v-select item-title="title"
		item-value="id"
		:items="wall.config.scenes.filter(s=>s.enabled&&sceneSources(s).length)"
		label="Szene"
		:model-value="wall.state.currentId"
		@update:model-value="id=>action('select',id)"
	/><v-btn :aria-busy="navigating"
		block
		:disabled="navigating"
		:loading="navigating"
		prepend-icon="mdi-tune"
		variant="tonal"
		@click="navigate('/admin')"
	>Verwaltung öffnen</v-btn></v-card></v-menu></div><div v-if="!wall.connected" class="offline-label">Verbindung unterbrochen · Wiederverbindung läuft</div></template>
	<Admin v-else :navigating @navigate="navigate"/>
	<v-snackbar color="error" :model-value="!!wall.error" @update:model-value="wall.error=''">{{wall.error}}</v-snackbar>
</v-app>
</template>
