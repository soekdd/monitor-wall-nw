<script setup>
import { computed, ref } from 'vue';
import { wall, request } from '../api';
const props = defineProps({ scene: { type: Object, required: true }, saved: Boolean });
const emit = defineEmits(['source']);
const busy=ref(false),error=ref('');
const status=computed(()=>wall.apiStatus?.[props.scene.apiId]||{});
const gallery=computed(()=>wall.googlePhotos?.galleries?.[props.scene.id]);
const albumItems=computed(()=>[{title:'Alle ausgewählten Sammlungen',value:''},...(gallery.value?.albums||[]).filter(a=>a.id!=='highlights').map(a=>({title:a.displayName,value:a.id}))]);
async function run(operation){busy.value=true;error.value='';try{await operation();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function updateStatus(){wall.googlePhotos=await request('/google-photos/status');wall.apiStatus=await request('/apis/status');}
async function bind(){await run(async()=>{await request(`/google-photos/scenes/${props.scene.id}/connect`,'POST');await updateStatus();});}
async function refresh(){await run(async()=>{await request(`/google-photos/scenes/${props.scene.id}/refresh`,'POST');await updateStatus();});}
async function disconnect(){await run(async()=>{await request(`/google-photos/scenes/${props.scene.id}`,'DELETE');emit('source','');await updateStatus();});}
</script>
<template>
 <section class="google-gallery mb-5">
  <v-alert variant="tonal" color="warning" class="mb-4">Diese Galerie verwendet die Google Photos Ambient API. Google erlaubt den Zugriff nur nach Aufnahme ins <a href="https://developers.google.com/photos/partner-program/overview" target="_blank" rel="noopener noreferrer">Google Photos Partnerprogramm</a>. Eine erfolgreiche Google-Anmeldung allein schaltet die Galerie nicht frei.</v-alert>
  <v-alert variant="tonal" color="secondary" class="mb-4">Wähle deine Google-Photos-Alben oder Sammlungen aus. Die Fotos werden über Google geladen und als Bilderstapel auf der Wand dargestellt. Es werden keine Fotos auf diesem Rechner gespeichert.</v-alert>
  <v-alert v-if="!saved" variant="tonal" class="mb-4">Speichere die Szene zuerst. Danach kannst du ihre Google-Galerie verbinden.</v-alert>
  <v-alert v-if="status.configurationError" color="error" variant="tonal" class="mb-4">{{status.configurationError}}</v-alert>
  <p v-if="status.credentialSource" class="muted text-body-2 mb-4">OAuth-Zugangsdaten aus {{status.credentialSource}} geladen.</p>
  <p class="muted mb-4">{{status.connected?'Google verbunden':'Bitte die gewählte Ambient-API unter API-Einstellungen mit Google verbinden.'}}</p>
  <v-btn v-if="status.connected&&!gallery" color="primary" prepend-icon="mdi-link" :loading="busy" :disabled="!saved" @click="bind">Galerie verbinden</v-btn>
  <template v-if="gallery">
   <div class="d-flex ga-3 flex-wrap mb-4"><v-btn v-if="gallery.settingsUri" :href="gallery.settingsUri" target="_blank" rel="noopener noreferrer" color="primary" append-icon="mdi-open-in-new">Alben bei Google auswählen</v-btn><v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="busy" @click="refresh">Galerie aktualisieren</v-btn></div>
   <v-select v-if="gallery.albums?.length" :model-value="scene.googlePhotos?.mediaSourceId||''" :items="albumItems" label="Angezeigte Galerie" @update:model-value="id=>emit('source',id)"/>
   <p class="muted text-body-2 mb-3">{{gallery.sources?.length||0}} Fotos verfügbar<span v-if="gallery.updatedAt"> · Aktualisiert {{new Date(gallery.updatedAt).toLocaleString('de-DE')}}</span></p>
   <v-alert v-if="gallery.status==='waiting'" color="secondary" variant="tonal" class="mb-4">Wähle zuerst Alben bei Google aus und aktualisiere danach die Galerie.</v-alert>
   <v-alert v-if="gallery.status==='empty'" variant="tonal" class="mb-4">In der Auswahl sind noch keine anzeigbaren Fotos vorhanden.</v-alert>
   <v-alert v-if="gallery.error" color="error" variant="tonal" class="mb-4">{{gallery.error}}</v-alert>
   <p v-if="gallery.limited" class="muted text-body-2 mb-3">Die Galerie zeigt die ersten 500 Fotos des Albums.</p>
   <v-btn variant="text" color="error" size="small" :loading="busy" @click="disconnect">Galerie trennen</v-btn>
  </template>
  <v-alert v-if="error" color="error" variant="tonal" class="mt-4">{{error}}</v-alert>
 </section>
</template>
<style scoped>
.google-gallery{padding:18px;border:1px solid #92c8bf30;border-radius:12px}.google-user-code{font:600 24px monospace;letter-spacing:4px}
</style>
