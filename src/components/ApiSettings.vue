<script setup>
import { ref } from "vue";
import {
	wall, save, request, createId
} from "../api";
import { apiTypes } from "../../shared/api-types";
import GoogleApiAccount from "./GoogleApiAccount.vue";
const dialog = ref( false ), draft = ref( null ), options = ref( "{}" ), secrets = ref( "{}" ), busy = ref( false ), error = ref( "" ), notice = ref( "" );
const typeInfo = type => apiTypes.find( t => t.value === type );
const references = id => [ ...wall.config.scenes, ...wall.config.widgets ].filter( e => e.apiId === id );

function edit( api ) {
	draft.value = api ? structuredClone( JSON.parse( JSON.stringify( api ) ) ) : {
		id: createId(), title: "Neue API-Verbindung", type: "weather", options: { latitude: 51.05, longitude: 13.74 }
	};options.value = JSON.stringify(
		draft.value.options, null, 2
	);secrets.value = "{}";error.value = "";dialog.value = true;
}

function changeType( type ) {
	draft.value.type = type;draft.value.title = typeInfo( type ).title;options.value = JSON.stringify(
		typeInfo( type ).options, null, 2
	);secrets.value = "{}";
}

async function commit() {
	busy.value = true;error.value = "";

	try {
		const parsed = JSON.parse( options.value ), credentials = JSON.parse( secrets.value );

		if ( !parsed || Array.isArray( parsed ) || typeof parsed !== "object" ) {
			throw Error( "Dienstoptionen müssen ein JSON-Objekt sein." );
		}

		draft.value.options = parsed;const config = JSON.parse( JSON.stringify( wall.config ) );const index = config.apis.findIndex( a => a.id === draft.value.id );

		if ( index < 0 ) {
			config.apis.push( draft.value );
		} else {
			config.apis[ index ] = draft.value;
		}

		await save( config );

		if ( Object.keys( credentials ).length ) {
			await request(
				`/apis/${draft.value.id}/secrets`, "PUT", credentials
			);
		}

		wall.apiStatus = await request( "/apis/status" );dialog.value = false;notice.value = "API-Verbindung gespeichert";
	} catch( e ) {
		error.value = e.message;
	} finally {
		busy.value = false;
	}
}

async function remove( api ) {
	busy.value = true;

	try {
		const config = JSON.parse( JSON.stringify( wall.config ) );config.apis = config.apis.filter( a => a.id !== api.id );await save( config );notice.value = "API-Verbindung entfernt";
	} catch( e ) {
		wall.error = e.message;
	} finally {
		busy.value = false;
	}
}
</script>
<template>
<section class="api-settings">
	<div class="d-flex justify-space-between align-center ga-3 flex-wrap mb-6"><p class="muted">Gemeinsame Verbindungen für Medien und Informationsmodule. Zugangsdaten werden nur hier hinterlegt.</p><v-btn color="primary" prepend-icon="mdi-plus" @click="edit()">API hinzufügen</v-btn></div>
	<div class="widget-grid"><v-card v-for="api in wall.config.apis"
		:key="api.id"
		class="pa-6 api-card"
		:data-api-id="api.id"
	><h3>{{api.title}}</h3><p class="muted text-body-2 mt-2">{{typeInfo(api.type)?.title}}</p><p class="text-body-2 mt-4">{{typeInfo(api.type)?.help}}</p><p class="muted text-body-2 mt-3">{{references(api.id).length}} Verweise<span v-if="references(api.id).length"> · {{references(api.id).map(e=>e.title).join(', ')}}</span></p><GoogleApiAccount v-if="typeInfo(api.type)?.google" :api class="mt-5"/><p v-else-if="wall.apiStatus?.[api.id]?.secretFields?.length" class="muted text-body-2 mt-4">Zugangsdaten hinterlegt: {{wall.apiStatus[api.id].secretFields.join(', ')}}</p><div class="d-flex ga-2 mt-5 flex-wrap"><v-btn prepend-icon="mdi-tune" variant="tonal" @click="edit(api)">Konfigurieren</v-btn><v-btn color="error"
		:disabled="busy||references(api.id).length>0"
		variant="text"
		@click="remove(api)"
	>Entfernen</v-btn></div></v-card></div>
	<v-dialog v-model="dialog" max-width="720" scrollable><v-card><v-card-title class="pa-6">API-Verbindung konfigurieren</v-card-title><v-card-text v-if="draft"><v-text-field v-model="draft.title" label="Name"/><v-select :disabled="wall.config.apis.some(a=>a.id===draft.id)"
		:items="apiTypes"
		label="API / Dienst"
		:model-value="draft.type"
		@update:model-value="changeType"
	/><v-alert class="mb-5" color="secondary" variant="tonal">{{typeInfo(draft.type)?.help}}</v-alert><v-textarea v-model="options"
		class="code-input"
		label="Dienstoptionen (JSON)"
		rows="7"
		variant="outlined"
	/><template v-if="!typeInfo(draft.type)?.google"><p class="muted mb-3">Neue Zugangsdaten werden nur geschrieben. Ein leeres Objekt lässt vorhandene Werte unverändert. Leere Werte löschen die jeweilige Angabe. Unterstützt: password, authorization, clientId, clientSecret, refreshToken, apiKey.</p><v-textarea v-model="secrets"
		class="code-input"
		label="Neue Zugangsdaten (JSON)"
		rows="4"
		variant="outlined"
	/></template><p v-else class="muted">Die Google-Anmeldung und OAuth-Einrichtung findest du nach dem Speichern direkt bei dieser API-Verbindung.</p><v-alert v-if="error" color="error" variant="tonal">{{error}}</v-alert></v-card-text><v-card-actions class="pa-5"><v-spacer/><v-btn @click="dialog=false">Abbrechen</v-btn><v-btn color="primary"
		:loading="busy"
		variant="flat"
		@click="commit"
	>Speichern</v-btn></v-card-actions></v-card></v-dialog>
	<v-snackbar :model-value="!!notice" @update:model-value="notice=''">{{notice}}</v-snackbar>
</section>
</template>
