import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../server/store.js';
import { GooglePhotos, googleLink } from '../server/google-photos.js';
import { createWallServer } from '../server/app.js';
import { eligibleScenes } from '../server/scheduler.js';
import { fakeGoogle, png } from './fixtures/google-photos.js';
async function fixture(t) { const directory = await mkdtemp(path.join(os.tmpdir(), 'wall-photos-')); t.after(() => rm(directory, { recursive: true, force: true })); const store = await new JsonStore(directory).init(); return { directory, store }; }
const scene = { id: 'gallery', title: 'Familienalbum', type: 'google-photos', sources: [], enabled: true, category: 'Familie', seasons: [], hours: [], weight: 3, scrollSeconds: 90 };
async function connected(t) { const f = await fixture(t), mock = fakeGoogle(), photos = new GooglePhotos(f.store, { fetchImpl: mock.fetchImpl, now: mock.nowFn }); await photos.configure({ clientId: 'test.apps.googleusercontent.com', clientSecret: 'private-client' }); await photos.startLogin(); mock.now += 5001; await photos.pollLogin(); return { ...f, mock, photos }; }

test('device OAuth keeps codes/tokens private and respects pending/slow polling', async t => {
 const { store } = await fixture(t), mock = fakeGoogle(), photos = new GooglePhotos(store, { fetchImpl: mock.fetchImpl, now: mock.nowFn });
 await photos.configure({ clientId: 'test.apps.googleusercontent.com', clientSecret: 'private-client' }); const login = await photos.startLogin(); assert.equal(login.userCode, 'SHOW-CODE'); assert.equal(JSON.stringify(login).includes('private-device'), false);
 const before = mock.calls.length; await photos.pollLogin(); assert.equal(mock.calls.length, before);
 mock.pending = true; mock.now += 5001; assert.equal((await photos.pollLogin()).pending, true);
 mock.pending = false; mock.slowed = true; mock.now += 5001; assert.equal((await photos.pollLogin()).pollSeconds, 10);
 mock.now += 10001; assert.equal((await photos.pollLogin()).connected, true);
 assert.equal(store.secrets.googlePhotos.refreshToken, 'private-refresh'); assert.equal(JSON.stringify(photos.status()).includes('private-'), false);
});
test('albums supply photo-only stack sources; pagination, refresh and restart retain binding', async t => {
 const { photos, mock, store, directory } = await connected(t); await photos.connectScene(scene); mock.pages = true;
 const result = await photos.refresh({ ...scene, googlePhotos: { mediaSourceId: 'album1' } });
 assert.equal(result.sources.length, 2); assert.equal(result.albums[0].displayName, 'Familie'); assert.equal(JSON.stringify(photos.publicGalleries()).includes('googleusercontent'), false);
 assert.equal(eligibleScenes({ scenes: [{ ...scene, sources: result.sources }] }).length, 1);
 const key = result.sources[0].split('/').at(-1); assert.deepEqual(Buffer.from(await (await photos.image(scene.id, key)).arrayBuffer()), png);
 const count = mock.calls.length; await photos.refresh(scene); assert.ok(mock.calls.length > count, 'changing album selection refreshes immediately');
 const count2 = mock.calls.length; await photos.refresh(scene); assert.equal(mock.calls.length, count2, 'ordinary tick reuses valid URLs');
 const restarted = new GooglePhotos(await new JsonStore(directory).init(), { fetchImpl: mock.fetchImpl, now: mock.nowFn }); await restarted.refresh(scene); assert.equal(restarted.sources(scene.id).length, 1);
 assert.equal(store.secrets.googlePhotos.devices.gallery.id, 'remote-device');
});
test('empty selection, outage, expiration and disconnect do not leave playable stale images', async t => {
 const { photos, mock, store } = await connected(t); await photos.connectScene(scene); mock.ready = false; assert.equal((await photos.refresh(scene)).status, 'waiting'); assert.equal(photos.sources(scene.id).length, 0);
 mock.now += 31000; mock.ready = true; await photos.refresh(scene, true); assert.equal(photos.sources(scene.id).length, 1);
 mock.fail = true; mock.now += 41 * 60000; assert.equal((await photos.refresh(scene)).status, 'error'); assert.equal(photos.sources(scene.id).length, 1);
 mock.now += 10 * 60000; await photos.refresh(scene); assert.equal(photos.sources(scene.id).length, 0); await assert.rejects(photos.image(scene.id, 'missing'), /nicht mehr/);
 mock.fail = false; await photos.disconnectScene(scene.id); assert.equal(store.secrets.googlePhotos.devices.gallery, undefined); assert.equal(photos.sources(scene.id).length, 0);
});
test('external links and image hosts cannot redirect tokens to other servers', async t => {
 assert.equal(googleLink('https://photos.google.com/a'), true); assert.equal(googleLink('https://photos.google.com.evil.test/a'), false); assert.equal(googleLink('http://photos.google.com/a'), false);
 const { photos, mock } = await connected(t); await photos.connectScene(scene); const original = mock.fetchImpl;
 photos.fetch = async (url, opts) => String(url).includes('/mediaItems') ? json({ mediaItems: [{ id: 'bad', mediaFile: { mimeType: 'image/jpeg', baseUrl: 'http://127.0.0.1/private' } }] }) : original(url, opts);
 assert.equal((await photos.refresh(scene)).status, 'error'); assert.equal(photos.sources(scene.id).length, 0);
});
test('authenticated gallery API displays stacks, proxies bytes and guards bound scene deletion', async t => {
 const { directory, store } = await fixture(t), mock = fakeGoogle(); store.config.widgets.forEach(w => w.enabled = false); store.config.scenes.push(scene); await store.update(store.config);
 await store.updateSecrets(s => ({ ...s, googlePhotos: { clientId: 'test.apps.googleusercontent.com', clientSecret: 'private-client', refreshToken: 'private-refresh' } }));
 const server = await createWallServer({ directory, host: '127.0.0.1', port: 0, dist: path.resolve('dist'), photosOptions: { fetchImpl: mock.fetchImpl, now: mock.nowFn } }); t.after(() => server.close());
 const base = `http://127.0.0.1:${server.server.address().port}`, headers = { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' };
 const req = (url, method = 'GET', data) => fetch(base + url, { method, headers, body: data ? JSON.stringify(data) : undefined });
 assert.equal((await fetch(base + '/api/google-photos/status')).status, 401);
 assert.equal((await req('/api/google-photos/scenes/gallery/connect', 'POST')).status, 200);
 const gallery = await (await req('/api/google-photos/scenes/gallery/refresh', 'POST')).json(); assert.equal(gallery.sources.length, 1);
 assert.equal((await req('/api/control', 'POST', { action: 'select', id: 'gallery' })).status, 200);
 assert.equal(server.snapshot().state.currentId, 'gallery');
 const image = await req(gallery.sources[0]); assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
 assert.equal((await fetch(base + gallery.sources[0])).status, 401);
 const state = await (await req('/api/state')).json(); assert.equal(JSON.stringify(state).includes('private-'), false); assert.equal(JSON.stringify(state).includes('lh3.googleusercontent'), false);
 const config = { ...state.config, scenes: state.config.scenes.filter(s => s.id !== 'gallery') };
 assert.equal((await req('/api/config', 'PUT', { config, revision: state.state.revision })).status, 409);
 assert.equal((await req('/api/google-photos/scenes/gallery', 'DELETE')).status, 200);
 assert.equal((await req('/api/config', 'PUT', { config, revision: state.state.revision })).status, 200);
 const disk = JSON.parse(await readFile(path.join(directory, 'settings.json'), 'utf8')); assert.equal(disk.scenes.some(s => s.id === 'gallery'), false);
});

test('failed album changes clear old photos and respect retry intervals',async t=>{const {photos,mock}=await connected(t);await photos.connectScene(scene);await photos.refresh(scene);mock.fail=true;const changed={...scene,googlePhotos:{mediaSourceId:'another'}};await photos.refresh(changed);assert.equal(photos.sources(scene.id).length,0);const count=mock.calls.length;await photos.refresh(changed);assert.equal(mock.calls.length,count);});

test('a lost device response is recovered using its request UUID',async t=>{const {photos,store,mock}=await connected(t);const requestId='0ef30f99-a68d-4a74-bfca-8147a79a5e3d';await store.updateSecrets(s=>({...s,googlePhotos:{...s.googlePhotos,devices:{gallery:{requestId}}}}));await photos.connectScene(scene);assert.ok(mock.calls.some(c=>c.options.method==='DELETE'&&c.url.endsWith('/devices/'+requestId)));await assert.rejects(photos.configure({clientId:'another.apps.googleusercontent.com',clientSecret:'new'}),/trennen/);});
