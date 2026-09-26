<script setup>
import { computed, ref, onUnmounted } from 'vue';
import { wall, request } from '../api';
const props = defineProps({ scene: { type: Object, required: true }, saved: Boolean });
const emit = defineEmits(['source']);
const clientId = ref(''), clientSecret = ref(''), busy = ref(false), error = ref(''), login = ref(null), setup = ref(false);
let pollTimer;
const status = computed(() => wall.googlePhotos || {});
const gallery = computed(() => status.value.galleries?.[props.scene.id]);
const albumItems = computed(() => [{ title: 'Alle ausgewählten Sammlungen', value: '' }, ...(gallery.value?.albums || []).filter(a => a.id !== 'highlights').map(a => ({ title: a.displayName, value: a.id }))]);
async function run(operation) { busy.value = true; error.value = ''; try { await operation(); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
async function updateStatus() { wall.googlePhotos = await request('/google-photos/status'); }
async function configure() { await run(async () => { await request('/google-photos/credentials', 'PUT', { clientId: clientId.value, clientSecret: clientSecret.value }); clientSecret.value = ''; setup.value = false; await updateStatus(); }); }
async function connectAccount() { await run(async () => { login.value = await request('/google-photos/login', 'POST'); schedulePoll(login.value.pollSeconds); }); }
function schedulePoll(seconds) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, Math.max(5, seconds || 5) * 1000); }
async function poll() { try { const result = await request('/google-photos/login/poll', 'POST'); if (result.connected) { login.value = null; await updateStatus(); } else schedulePoll(result.pollSeconds); } catch (e) { login.value = null; error.value = e.message; } }
async function bind() { await run(async () => { await request(`/google-photos/scenes/${props.scene.id}/connect`, 'POST'); await updateStatus(); }); }
async function refresh() { await run(async () => { await request(`/google-photos/scenes/${props.scene.id}/refresh`, 'POST'); await updateStatus(); }); }
async function disconnect() { await run(async () => { await request(`/google-photos/scenes/${props.scene.id}`, 'DELETE'); emit('source', ''); await updateStatus(); }); }
onUnmounted(() => clearTimeout(pollTimer));
</script>
<template>
 <section class="google-gallery mb-5">
  <v-alert variant="tonal" color="secondary" class="mb-4">Wähle deine Google-Photos-Alben oder Sammlungen aus. Die Fotos werden über Google geladen und als Bilderstapel auf der Wand dargestellt. Es werden keine Fotos auf diesem Rechner gespeichert.</v-alert>
  <v-alert v-if="!saved" variant="tonal" class="mb-4">Speichere die Szene zuerst. Danach kannst du ihre Google-Galerie verbinden.</v-alert>
  <div class="d-flex align-center ga-3 flex-wrap mb-4"><v-chip :color="status.connected?'primary':undefined" prepend-icon="mdi-google-photos">{{ status.connected?'Google Photos verbunden':'Google Photos nicht verbunden' }}</v-chip><v-btn variant="text" size="small" @click="setup=!setup">{{status.configured?'OAuth-Einrichtung ändern':'OAuth einrichten'}}</v-btn></div>
  <div v-if="setup||!status.configured" class="mb-5">
   <p class="muted text-body-2 mb-4">Aktiviere in deinem Google-Cloud-Projekt die Google Photos Ambient API und erstelle einen OAuth-Client vom Typ „TVs und Geräte mit begrenzter Eingabe“. Trage dessen Zugangsdaten hier ein.</p>
   <v-text-field v-model="clientId" label="Google Client-ID" autocomplete="off"/><v-text-field v-model="clientSecret" label="Client-Secret" type="password" autocomplete="off"/>
   <v-btn variant="tonal" :loading="busy" :disabled="!clientId||!clientSecret" @click="configure">OAuth-Einrichtung speichern</v-btn>
  </div>
  <v-btn v-if="status.connected&&!login" variant="text" size="small" :loading="busy" @click="connectAccount">Google erneut anmelden</v-btn>
  <v-btn v-if="status.configured&&!status.connected&&!login" color="primary" prepend-icon="mdi-google" :loading="busy" @click="connectAccount">Mit Google verbinden</v-btn>
  <v-card v-if="login" variant="tonal" class="pa-5 mb-4"><p>Öffne die Google-Anmeldung und gib diesen Code ein:</p><div class="google-user-code my-4">{{login.userCode}}</div><v-btn :href="login.verificationUrl" target="_blank" rel="noopener noreferrer" color="primary" append-icon="mdi-open-in-new">Google-Anmeldung öffnen</v-btn><p class="muted text-body-2 mt-4">Die Verbindung wird automatisch geprüft. Du kannst dich auch auf deinem Smartphone anmelden.</p></v-card>
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
