import { randomUUID, createHash } from 'node:crypto';

const API = 'https://photosambient.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/photosambient.mediaitems';
const REFRESH_MS = 40 * 60 * 1000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
export function googleLink(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['photos.google.com', 'accounts.google.com', 'www.google.com'].includes(u.hostname) && !u.username && !u.password; } catch { return false; }
}
function photoUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.googleusercontent.com') || u.username || u.password) throw fail('Ungültige Bildadresse von Google Photos.');
  return u.href;
}
export class GooglePhotos {
  constructor(store, { fetchImpl = fetch, now = Date.now } = {}) {
    this.store = store; this.fetch = fetchImpl; this.now = now;
    this.galleries = {}; this.auth = null; this.access = null; this.tokenRequest = null; this.pending = new Map(); this.nextRefresh = new Map(); this.listRequests = new Map();
  }
  get credentials() { return this.store.secrets.googlePhotos || {}; }
  status() { return { configured: !!(this.credentials.clientId && this.credentials.clientSecret), connected: !!this.credentials.refreshToken, galleries: this.publicGalleries() }; }
  async configure({ clientId, clientSecret }) {
    if (typeof clientId !== 'string' || !clientId.endsWith('.apps.googleusercontent.com') || clientId.length > 500 || typeof clientSecret !== 'string' || !clientSecret || clientSecret.length > 2000 || /[\r\n]/.test(clientId + clientSecret)) throw fail('Bitte eine gültige Google-Client-ID und ein Client-Secret eingeben.');
    if (this.credentials.clientId && this.credentials.clientId !== clientId && Object.keys(this.credentials.devices || {}).length) throw fail('Zuerst alle Galerien trennen, bevor du den Google-OAuth-Client wechselst.');
    await this.store.updateSecrets(s => ({ ...s, googlePhotos: { ...s.googlePhotos, clientId, clientSecret } }));
    this.access = null; this.auth = null;
  }
  async json(url, options = {}) {
    const r = await this.fetch(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
    const d = await r.json();
    if (!r.ok) throw Object.assign(fail(`Google Photos: ${d.error?.message || d.error_description || (typeof d.error === 'string' ? d.error : `HTTP ${r.status}`)}`, 502), { googleCode: typeof d.error === 'string' ? d.error : d.error?.status });
    return d;
  }
  async startLogin() {
    const c = this.credentials;
    if (!c.clientId || !c.clientSecret) throw fail('Bitte zuerst den Google-OAuth-Client einrichten.');
    if (this.auth && this.auth.expiresAt > this.now()) return this.loginView();
    const d = await this.json('https://oauth2.googleapis.com/device/code', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, scope: SCOPE }) });
    if (!googleLink(d.verification_url) || !d.device_code || !d.user_code) throw fail('Google hat keine gültige Anmeldung zurückgegeben.', 502);
    this.auth = { deviceCode: d.device_code, userCode: d.user_code, url: d.verification_url, expiresAt: this.now() + Number(d.expires_in) * 1000, interval: Math.max(5, Number(d.interval) || 5) * 1000, nextPoll: this.now() + Math.max(5, Number(d.interval) || 5) * 1000 };
    return this.loginView();
  }
  loginView() { const a = this.auth; return { userCode: a.userCode, verificationUrl: a.url, expiresAt: a.expiresAt, pollSeconds: a.interval / 1000 }; }
  async pollLogin() {
    if (!this.auth) return { connected: !!this.credentials.refreshToken };
    const a = this.auth;
    if (a.expiresAt <= this.now()) { this.auth = null; throw fail('Die Google-Anmeldung ist abgelaufen. Bitte erneut starten.'); }
    if (a.busy || a.nextPoll > this.now()) return { connected: false, pending: true, pollSeconds: a.interval / 1000 };
    a.busy = true; a.nextPoll = this.now() + a.interval;
    try {
      const c = this.credentials;
      const d = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, device_code: a.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
      if (!d.refresh_token) throw fail('Google hat kein dauerhaftes Zugriffstoken geliefert. Bitte erneut anmelden.', 502);
      await this.store.updateSecrets(s => ({ ...s, googlePhotos: { ...s.googlePhotos, refreshToken: d.refresh_token } }));
      this.access = { token: d.access_token, expiresAt: this.now() + (Number(d.expires_in) || 3600) * 1000 }; this.auth = null;
      return { connected: true };
    } catch (e) {
      if (e.googleCode === 'authorization_pending' || e.googleCode === 'slow_down') { if (e.googleCode === 'slow_down') a.interval += 5000; a.nextPoll = this.now() + a.interval; return { connected: false, pending: true, pollSeconds: a.interval / 1000 }; }
      this.auth = null; throw e;
    } finally { a.busy = false; }
  }
  async accessToken() {
    if (this.access?.expiresAt > this.now() + 60000) return this.access.token;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = (async () => {
      const c = this.credentials;
      if (!c.refreshToken) throw fail('Bitte Google Photos verbinden.');
      const d = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }) });
      this.access = { token: d.access_token, expiresAt: this.now() + (Number(d.expires_in) || 3600) * 1000 }; return d.access_token;
    })();
    try { return await this.tokenRequest; } finally { this.tokenRequest = null; }
  }
  async api(route, method = 'GET', body) {
    const options = { method, headers: { Authorization: `Bearer ${await this.accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
    if (method === 'DELETE') { const r = await this.fetch(API + route, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' }); if (!r.ok && r.status !== 404) throw fail(`Google-Gerät konnte nicht getrennt werden (HTTP ${r.status}).`, 502); return; }
    return this.json(API + route, options);
  }
  async connectScene(scene) {
    if (this.credentials.devices?.[scene.id]?.id) return this.refresh(scene, true);
    if (this.pending.has(scene.id)) throw fail('Diese Galerie wird bereits verbunden.', 409);
    const op = (async () => {
      const previous=this.credentials.devices?.[scene.id];
      if(previous?.requestId&&!previous.id)await this.api(`/devices/${encodeURIComponent(previous.requestId)}`,'DELETE');
      const requestId = randomUUID();
      await this.store.updateSecrets(s => ({ ...s, googlePhotos: { ...s.googlePhotos, devices: { ...s.googlePhotos?.devices, [scene.id]: { requestId } } } }));
      const d = await this.api(`/devices?requestId=${requestId}`, 'POST', { displayName: scene.title.slice(0, 100) });
      if (!d.id || !googleLink(d.settingsUri)) throw fail('Google hat keine gültige Galerie zurückgegeben.', 502);
      await this.store.updateSecrets(s => ({ ...s, googlePhotos: { ...s.googlePhotos, devices: { ...s.googlePhotos.devices, [scene.id]: { requestId, id: d.id } } } }));
      this.galleries[scene.id] = { status: 'waiting', sources: [], settingsUri: d.settingsUri, albums: d.mediaSources || [] }; this.nextRefresh.delete(scene.id);
      return this.galleries[scene.id];
    })(); this.pending.set(scene.id, op); try { return await op; } finally { this.pending.delete(scene.id); }
  }
  async disconnectScene(id) {
    if (this.pending.has(id)) throw fail('Bitte warten, bis die Aktualisierung abgeschlossen ist.', 409);
    const d = this.credentials.devices?.[id];
    if (d?.id) await this.api(`/devices/${encodeURIComponent(d.id)}`, 'DELETE');
    else if (d?.requestId) await this.api(`/devices/${encodeURIComponent(d.requestId)}`, 'DELETE');
    await this.store.updateSecrets(s => { const devices = { ...s.googlePhotos?.devices }; delete devices[id]; return { ...s, googlePhotos: { ...s.googlePhotos, devices } }; });
    delete this.galleries[id]; this.nextRefresh.delete(id);
  }
  async refresh(scene, force = false) {
    const binding = this.credentials.devices?.[scene.id]; if (!binding?.id) return null;
    if (this.pending.has(scene.id)) return this.pending.get(scene.id);
    const sourceChanged=this.galleries[scene.id]&&this.galleries[scene.id].mediaSourceId!==(scene.googlePhotos?.mediaSourceId||'');
    if (!force && !sourceChanged && (this.nextRefresh.get(scene.id) || 0) > this.now()) return this.galleries[scene.id];
    // Manual refreshes are bounded too, to avoid consuming the per-device quota.
    if (force && !sourceChanged && this.galleries[scene.id]?.lastAttempt > this.now() - 30000) return this.galleries[scene.id];
    const op = (async () => {
      const old = this.galleries[scene.id]; this.nextRefresh.set(scene.id, this.now() + 60000);
      try {
        const device = await this.api(`/devices/${encodeURIComponent(binding.id)}`);
        if (!googleLink(device.settingsUri)) throw fail('Ungültiger Google-Photos-Konfigurationslink.', 502);
        const info = { mediaSourceId:scene.googlePhotos?.mediaSourceId||'', settingsUri: device.settingsUri, albums: (device.mediaSources || []).map(a => ({ id: a.id, displayName: a.displayName })), lastAttempt: this.now() };
        if (!device.mediaSourcesSet) { this.nextRefresh.set(scene.id, this.now() + Math.max(30, parseFloat(device.pollingConfig?.pollInterval) || 30) * 1000); return this.galleries[scene.id] = { ...info, status: 'waiting', sources: [] }; }
        const items = new Map(); let pageToken, pages = 0;
        do {
          const params = new URLSearchParams({ deviceId: binding.id, pageSize: '100', ...(scene.googlePhotos?.mediaSourceId ? { mediaSourceId: scene.googlePhotos.mediaSourceId } : {}), ...(pageToken ? { pageToken } : {}) });
          const requests=(this.listRequests.get(binding.id)||[]).filter(time=>time>this.now()-86400000);
          if(requests.length>=240)throw fail('Tageslimit für diese Google-Galerie erreicht. Bitte später erneut versuchen.',429);
          requests.push(this.now());this.listRequests.set(binding.id,requests);
          const data = await this.api(`/mediaItems?${params}`);
          for (const item of data.mediaItems || []) if (item.id && imageTypes.has(item.mediaFile?.mimeType)) { const key = createHash('sha256').update(item.id).digest('hex'); items.set(key, { baseUrl: photoUrl(item.mediaFile.baseUrl), mimeType: item.mediaFile.mimeType }); }
          pageToken = data.nextPageToken; pages++;
        } while (scene.googlePhotos?.mediaSourceId && pageToken && pages < 5);
        this.nextRefresh.set(scene.id, this.now() + REFRESH_MS);
        return this.galleries[scene.id] = { ...info, status: items.size ? 'ok' : 'empty', updatedAt: this.now(), sources: [...items.keys()].map(key => `/api/google-photos/media/${scene.id}/${key}`), items, limited: !!(scene.googlePhotos?.mediaSourceId && pageToken) };
      } catch (e) {
        const sources = !sourceChanged&&old?.updatedAt > this.now() - 50 * 60000 ? old.sources : [];
        return this.galleries[scene.id] = { ...old, mediaSourceId:scene.googlePhotos?.mediaSourceId||'', items:sourceChanged?undefined:old?.items, sources: sources || [], status: 'error', lastAttempt: this.now(), error: e.message };
      }
    })(); this.pending.set(scene.id, op); try { return await op; } finally { this.pending.delete(scene.id); }
  }
  publicGalleries() { return Object.fromEntries(Object.entries(this.galleries).map(([id, { items, lastAttempt, ...gallery }]) => [id, gallery])); }
  sources(id) { return this.galleries[id]?.sources || []; }
  async image(id, key, signal) {
    const gallery = this.galleries[id], item = gallery?.items?.get(key);
    if (!item || gallery.updatedAt <= this.now() - 50 * 60000) throw fail('Foto ist nicht mehr verfügbar. Galerie aktualisieren.', 404);
    const r = await this.fetch(`${item.baseUrl}=w2048-h2048`, { headers: { Authorization: `Bearer ${await this.accessToken()}` }, redirect: 'error', signal });
    if (!r.ok || !imageTypes.has((r.headers.get('content-type') || '').split(';')[0])) throw fail('Google konnte das Foto nicht laden.', 502);
    return r;
  }
}
