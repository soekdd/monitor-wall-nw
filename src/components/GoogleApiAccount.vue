<script setup>
import { computed, ref, nextTick, onUnmounted } from 'vue';
import { wall, request } from '../api';
const props=defineProps({api:Object});
const status=computed(()=>wall.apiStatus?.[props.api.id]||{});
const clientId=ref(''),clientSecret=ref(''),setup=ref(false),setupForm=ref(null),busy=ref(false),error=ref(''),login=ref(null);
let timer;
async function refresh(){wall.apiStatus=await request('/apis/status');}
async function run(operation){busy.value=true;error.value='';try{await operation();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function toggle(){setup.value=!setup.value;if(setup.value){await nextTick();setupForm.value?.querySelector('input')?.focus();}}
async function configure(){await run(async()=>{await request(`/apis/${props.api.id}/secrets`,'PUT',{clientId:clientId.value.trim(),clientSecret:clientSecret.value.trim()});clientSecret.value='';setup.value=false;await refresh();});}
async function fromFile(){await run(async()=>{await request(`/apis/${props.api.id}/credentials/file`,'POST');await refresh();});}
async function connect(){await run(async()=>{login.value=await request(`/apis/${props.api.id}/login`,'POST');schedule(login.value.pollSeconds);});}
function schedule(seconds){clearTimeout(timer);timer=setTimeout(poll,Math.max(5,seconds||5)*1000);}
async function poll(){try{const result=await request(`/apis/${props.api.id}/login/poll`,'POST');if(result.connected){login.value=null;await refresh();}else schedule(result.pollSeconds);}catch(e){error.value=e.message;login.value=null;}}
onUnmounted(()=>clearTimeout(timer));
</script>
<template>
 <section class="google-account">
  <div class="d-flex ga-2 flex-wrap align-center"><v-chip :color="status.connected?'primary':undefined">{{status.connected?'Google verbunden':status.configured?'OAuth eingerichtet':'OAuth noch nicht eingerichtet'}}</v-chip><v-btn variant="text" size="small" :aria-expanded="setup" @click="toggle">{{setup?'OAuth-Einrichtung schließen':status.configured?'OAuth-Einrichtung ändern':'OAuth einrichten'}}</v-btn></div>
  <p v-if="status.credentialSource" class="muted text-body-2 mt-3">OAuth-Zugangsdaten aus {{status.credentialSource}} geladen.</p>
  <div v-if="setup" ref="setupForm" class="oauth-setup mt-4">
   <p class="muted mb-4">{{api.type==='google-picker'?'Verwende einen OAuth-Client vom Typ „Desktop-App“. Lege die JSON als config/client_secret_picker.json ab. Die Google-Anmeldung muss im Browser auf dem Rechner der Bilderwand erfolgen.':'Verwende einen OAuth-Client vom Typ „TVs und Geräte mit begrenzter Eingabe“.'}} Die jeweilige API muss in Google Cloud aktiviert sein.</p>
   <v-text-field v-model="clientId" label="Google Client-ID" autocomplete="off"/><v-text-field v-model="clientSecret" label="Client-Secret" type="password" autocomplete="off"/>
   <div class="d-flex ga-2 flex-wrap"><v-btn variant="tonal" :loading="busy" :disabled="!clientId||!clientSecret" @click="configure">OAuth-Einrichtung speichern</v-btn><v-btn variant="text" :loading="busy" @click="fromFile">OAuth-Datei aus config übernehmen</v-btn></div>
  </div>
  <v-btn v-if="status.configured&&!login" color="primary" variant="tonal" class="mt-4" :loading="busy" @click="connect">{{status.connected?'Google erneut anmelden':'Mit Google verbinden'}}</v-btn>
  <v-card v-if="login" variant="tonal" class="pa-4 mt-4"><template v-if="login.userCode"><p>Gib diesen Code bei Google ein:</p><div class="my-3 text-h5">{{login.userCode}}</div></template><p v-else class="mb-3">Öffne die Anmeldung im Browser auf dem Rechner der Bilderwand.</p><v-btn :href="login.authorizationUrl||login.verificationUrl" target="_blank" rel="noopener noreferrer" color="primary">Google-Anmeldung öffnen</v-btn><p class="muted text-body-2 mt-3">Die Freigabe wird automatisch geprüft. Wähle das als Testnutzer hinterlegte Google-Konto.</p></v-card>
  <v-alert v-if="error||status.configurationError" color="error" variant="tonal" class="mt-4">{{error||status.configurationError}}</v-alert>
 </section>
</template>
