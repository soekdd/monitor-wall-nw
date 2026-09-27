<script setup>
import { computed, ref } from "vue";
import { wall, request } from "../api";
const props = defineProps( { scene: { type: Object, required: true }, saved: Boolean } );
const emit = defineEmits( [ "source" ] );
const busy = ref( false ), error = ref( "" );
const status = computed( () => wall.apiStatus?.[ props.scene.apiId ] || {} );
const gallery = computed( () => wall.googlePhotos?.galleries?.[ props.scene.id ] );
const albumItems = computed( () => [ { title: "Alle ausgewählten Sammlungen", value: "" }, ...( gallery.value?.albums || [] ).filter( a => a.id !== "highlights" ).map( a => ( { title: a.displayName, value: a.id } ) ) ] );

async function run( operation ) {
	busy.value = true;error.value = "";

	try {
		await operation();
	} catch( e ) {
		error.value = e.message;
	} finally {
		busy.value = false;
	}
}

async function updateStatus() {
	wall.googlePhotos = await request( "/google-photos/status" );wall.apiStatus = await request( "/apis/status" );
}

async function bind() {
	await run( async() => {
		await request( `/google-photos/scenes/${props.scene.id}/connect`, "POST" );await updateStatus();
	} );
}

async function refresh() {
	await run( async() => {
		await request( `/google-photos/scenes/${props.scene.id}/refresh`, "POST" );await updateStatus();
	} );
}

async function disconnect() {
	await run( async() => {
		await request( `/google-photos/scenes/${props.scene.id}`, "DELETE" );emit( "source", "" );await updateStatus();
	} );
}
</script>
<template>
<section class="google-gallery mb-5">
	<v-alert class="mb-4" color="warning" variant="tonal">Diese Galerie verwendet die Google Photos Ambient API. Google erlaubt den Zugriff nur nach Aufnahme ins <a href="https://developers.google.com/photos/partner-program/overview" rel="noopener noreferrer" target="_blank">Google Photos Partnerprogramm</a>. Eine erfolgreiche Google-Anmeldung allein schaltet die Galerie nicht frei.</v-alert>
	<v-alert class="mb-4" color="secondary" variant="tonal">Wähle deine Google-Photos-Alben oder Sammlungen aus. Die Fotos werden über Google geladen und als Bilderstapel auf der Wand dargestellt. Es werden keine Fotos auf diesem Rechner gespeichert.</v-alert>
	<v-alert v-if="!saved" class="mb-4" variant="tonal">Speichere die Szene zuerst. Danach kannst du ihre Google-Galerie verbinden.</v-alert>
	<v-alert v-if="status.configurationError"
		class="mb-4"
		color="error"
		variant="tonal"
	>{{status.configurationError}}</v-alert>
	<p v-if="status.credentialSource" class="muted text-body-2 mb-4">OAuth-Zugangsdaten aus {{status.credentialSource}} geladen.</p>
	<p class="muted mb-4">{{status.connected?'Google verbunden':'Bitte die gewählte Ambient-API unter API-Einstellungen mit Google verbinden.'}}</p>
	<v-btn v-if="status.connected&&!gallery"
		color="primary"
		:disabled="!saved"
		:loading="busy"
		prepend-icon="mdi-link"
		@click="bind"
	>Galerie verbinden</v-btn>
	<template v-if="gallery">
		<div class="d-flex ga-3 flex-wrap mb-4"><v-btn v-if="gallery.settingsUri"
			append-icon="mdi-open-in-new"
			color="primary"
			:href="gallery.settingsUri"
			rel="noopener noreferrer"
			target="_blank"
		>Alben bei Google auswählen</v-btn><v-btn :loading="busy"
			prepend-icon="mdi-refresh"
			variant="tonal"
			@click="refresh"
		>Galerie aktualisieren</v-btn></div>
		<v-select v-if="gallery.albums?.length"
			:items="albumItems"
			label="Angezeigte Galerie"
			:model-value="scene.googlePhotos?.mediaSourceId||''"
			@update:model-value="id=>emit('source',id)"
		/>
		<p class="muted text-body-2 mb-3">{{gallery.sources?.length||0}} Fotos verfügbar<span v-if="gallery.updatedAt"> · Aktualisiert {{new Date(gallery.updatedAt).toLocaleString('de-DE')}}</span></p>
		<v-alert v-if="gallery.status==='waiting'"
			class="mb-4"
			color="secondary"
			variant="tonal"
		>Wähle zuerst Alben bei Google aus und aktualisiere danach die Galerie.</v-alert>
		<v-alert v-if="gallery.status==='empty'" class="mb-4" variant="tonal">In der Auswahl sind noch keine anzeigbaren Fotos vorhanden.</v-alert>
		<v-alert v-if="gallery.error"
			class="mb-4"
			color="error"
			variant="tonal"
		>{{gallery.error}}</v-alert>
		<p v-if="gallery.limited" class="muted text-body-2 mb-3">Die Galerie zeigt die ersten 500 Fotos des Albums.</p>
		<v-btn color="error"
			:loading="busy"
			size="small"
			variant="text"
			@click="disconnect"
		>Galerie trennen</v-btn>
	</template>
	<v-alert v-if="error"
		class="mt-4"
		color="error"
		variant="tonal"
	>{{error}}</v-alert>
</section>
</template>
<style scoped>
.google-gallery{padding:18px;border:1px solid #92c8bf30;border-radius:12px}.google-user-code{font:600 24px monospace;letter-spacing:4px}
</style>
