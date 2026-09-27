<script setup>
import {computed,ref,onUnmounted} from 'vue';
import {wall,request} from '../api';
const props=defineProps({scene:Object,saved:Boolean});
const emit=defineEmits(['imported']);
const selection=ref(null),busy=ref(false),error=ref('');let timer;
const account=computed(()=>wall.apiStatus?.[props.scene.apiId]||{});
const job=computed(()=>account.value.imports?.[props.scene.id]);
const route=()=>`/google-picker/scenes/${props.scene.id}`;
async function run(operation){busy.value=true;error.value='';try{await operation();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function schedule(seconds){clearTimeout(timer);timer=setTimeout(poll,Math.max(1,seconds||5)*1000);}
async function start(){await run(async()=>{selection.value=await request(`${route()}/session`,'POST');schedule(selection.value.pollSeconds);});}
async function poll(){try{const result=await request(`${route()}/poll`,'POST');if(result.status==='done'){clearTimeout(timer);selection.value=null;emit('imported');return;}if(job.value?.status==='error'){error.value=job.value.error;return;}selection.value={...selection.value,...result};if(result.status==='waiting'||result.status==='importing')schedule(result.pollSeconds||2);}catch(e){error.value=e.message;}}
async function importPhotos(){await run(async()=>{await request(`${route()}/import`,'POST');selection.value={...selection.value,status:'importing'};schedule(2);});}
async function cancel(){await run(async()=>{await request(`${route()}/session`,'DELETE');clearTimeout(timer);selection.value=null;});}
onUnmounted(()=>clearTimeout(timer));
</script>
<template>
 <section class="google-picker mb-5">
  <v-alert variant="tonal" color="secondary" class="mb-4">Wähle mehrere Fotos bei Google aus; nach dem Import werden sie lokal als Bilderstapel angezeigt. Suche im Picker nach deinem Albumtitel. Eine neue Auswahl ersetzt den bisherigen Stapel erst nach erfolgreichem Import. Neue Albumfotos werden nicht automatisch übernommen.</v-alert>
  <p v-if="!saved" class="muted mb-4">Speichere die Szene mit ihrer API-Verbindung zuerst.</p>
  <p v-else-if="!account.connected" class="muted mb-4">Verbinde diese Picker-API unter API-Einstellungen mit Google.</p>
  <p class="muted mb-4">{{scene.sources.length}} Fotos lokal verfügbar.</p>
  <v-btn color="primary" prepend-icon="mdi-google-photos" :loading="busy" :disabled="!saved||!account.connected||job?.status==='importing'" @click="start">{{selection?'Auswahl fortsetzen':'Fotos bei Google auswählen'}}</v-btn>
  <div v-if="selection" class="mt-4"><v-btn v-if="selection.status==='waiting'" :href="selection.pickerUri" target="_blank" rel="noopener noreferrer" variant="tonal" append-icon="mdi-open-in-new">Google-Fotoauswahl öffnen</v-btn><p v-if="selection.status==='waiting'" class="muted mt-3">Die abgeschlossene Auswahl wird automatisch erkannt.</p><v-btn v-if="selection.status==='ready'" color="primary" :loading="busy" @click="importPhotos">Ausgewählte Fotos importieren</v-btn><v-btn v-if="selection.status!=='importing'" variant="text" @click="cancel">Auswahl abbrechen</v-btn></div>
  <div v-if="job?.status==='importing'" class="mt-4"><v-progress-linear :indeterminate="!job.total" :model-value="job.total?job.completed/job.total*100:0" color="primary"/><p class="muted mt-2">{{job.completed}} / {{job.total||'…'}} Fotos importiert. Der Import läuft auch nach dem Schließen des Dialogs weiter.</p></div>
  <v-alert v-if="error||job?.error" color="error" variant="tonal" class="mt-4">{{error||job?.error}}</v-alert>
 </section>
</template>
