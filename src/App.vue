<script setup>
import {ref,onMounted} from 'vue';
import {wall,connect,action,sceneSources} from './api';
import Admin from './components/Admin.vue';
import WallCanvas from './components/WallCanvas.vue';
const isWall=location.pathname==='/wall',monitor=new URLSearchParams(location.search).get('monitor');
const token=ref(''),loading=ref(false),loginError=ref(''),menu=ref(false);
async function login(){loading.value=true;loginError.value='';try{await connect(token.value||undefined);}catch(e){loginError.value=e.message;}finally{loading.value=false;}}
onMounted(async()=>{try{await connect();}catch{}});
</script>
<template>
 <v-app>
  <div v-if="!wall.authenticated" class="login-shell"><v-card class="login-card" width="440"><div class="brand-mark"><v-icon icon="mdi-view-dashboard-outline"/></div><div class="eyebrow mt-8">MONITOR WALL</div><h1 class="mt-3">Ein Zuhause für<br>deine Augenblicke.</h1><p class="muted mt-4 mb-7">Verbinde dich mit deiner Bilderwand. Den Zugangscode findest du in der lokalen Verwaltung oder beim Start im Terminal.</p><form @submit.prevent="login"><v-text-field v-model="token" label="Zugangscode" type="password" autocomplete="current-password" :error-messages="loginError"/><v-btn type="submit" block color="primary" size="large" :loading="loading">Mit der Bilderwand verbinden <v-icon end icon="mdi-arrow-right"/></v-btn></form></v-card></div>
  <template v-else-if="isWall"><WallCanvas :monitor="monitor" class="fullscreen-wall"/><div class="wall-pulldown"><v-menu v-model="menu" :close-on-content-click="false" location="bottom"><template #activator="{props}"><v-btn v-bind="props" variant="tonal" prepend-icon="mdi-chevron-down" aria-label="Bilderwand steuern">Bilderwand</v-btn></template><v-card width="340" class="pa-5"><h3 class="mb-4">{{wall.config.name}}</h3><div class="d-flex ga-2 mb-4"><v-btn icon="mdi-skip-previous" aria-label="Vorheriges Bild" @click="action('previous')"/><v-btn :icon="wall.state.paused?'mdi-play':'mdi-pause'" :aria-label="wall.state.paused?'Abspielen':'Pausieren'" @click="action('pause')"/><v-btn icon="mdi-skip-next" aria-label="Nächstes Bild" @click="action('next')"/></div><v-select label="Szene" :model-value="wall.state.currentId" :items="wall.config.scenes.filter(s=>s.enabled&&sceneSources(s).length)" item-title="title" item-value="id" @update:model-value="id=>action('select',id)"/><v-btn href="/admin" block variant="tonal" prepend-icon="mdi-tune">Verwaltung öffnen</v-btn></v-card></v-menu></div><div v-if="!wall.connected" class="offline-label">Verbindung unterbrochen · Wiederverbindung läuft</div></template>
  <Admin v-else/>
  <v-snackbar :model-value="!!wall.error" @update:model-value="wall.error=''" color="error">{{wall.error}}</v-snackbar>
 </v-app>
</template>
