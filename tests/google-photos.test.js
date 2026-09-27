import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../server/store.js';
import { GooglePhotos, googleLink } from '../server/google-photos.js';
import { apiStore } from '../server/api-connections.js';
import { createWallServer } from '../server/app.js';
import { eligibleScenes } from '../server/scheduler.js';
import { fakeGoogle, png } from './fixtures/google-photos.js';
async function fixture(t) { const directory = await mkdtemp(path.join(os.tmpdir(), 'wall-photos-')); t.after(() => rm(directory, { recursive: true, force: true })); const store = await new JsonStore(directory).init(); return { directory, store }; }
const scene = { id: 'gallery', title: 'Familienalbum', type: 'google-photos', sources: [], enabled: true, category: 'Familie', seasons: [], hours: [], weight: 3, scrollSeconds: 90 };
const clientJson = { installed: { client_id: 'test.apps.googleusercontent.com', client_secret: 'private-client', token_uri: 'https://untrusted.example/token' } };
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
test('downloaded OAuth JSON loads credentials privately and ignores supplied endpoints', async t => {
 const {store,directory}=await fixture(t), mock=fakeGoogle(), photos=new GooglePhotos(store,{fetchImpl:mock.fetchImpl,now:mock.nowFn});
 await writeFile(path.join(directory,'client_secret_test.json'),JSON.stringify(clientJson));
 await photos.loadCredentials(directory);
 assert.equal(photos.status().configured,true);
 assert.equal(photos.status().credentialSource,'client_secret_test.json');
 assert.equal(store.secrets.googlePhotos.clientSecret,'private-client');
 assert.equal(JSON.stringify(photos.status()).includes('private-client'),false);
 await photos.startLogin();
 assert.equal(mock.calls[0].url,'https://oauth2.googleapis.com/device/code');
});
test('invalid and ambiguous credential files expose setup errors without breaking startup', async t => {
 const {store,directory}=await fixture(t),photos=new GooglePhotos(store);
 await photos.loadCredentials(path.join(directory,'missing'));assert.equal(photos.status().configurationError,undefined);
 const file=path.join(directory,'client_secret.json');
 await writeFile(file,'{invalid');await photos.loadCredentials(directory);assert.match(photos.status().configurationError,/gültiges JSON/);
 await writeFile(file,JSON.stringify({web:clientJson.installed}));await photos.loadCredentials(directory);assert.match(photos.status().configurationError,/Web-Client/);
 await assert.rejects(photos.startLogin(),/Web-Client/);
 await writeFile(file,JSON.stringify(clientJson));await writeFile(path.join(directory,'client_secret_second.json'),JSON.stringify(clientJson));
 await photos.loadCredentials(directory);assert.match(photos.status().configurationError,/Mehrere/);
 await photos.loadCredentials(directory,file);assert.equal(photos.status().configured,true);assert.equal(photos.status().configurationError,undefined);
});
test('Google invalid client type produces actionable device-client instructions', async t => {
 const {store}=await fixture(t),photos=new GooglePhotos(store,{fetchImpl:async()=>new Response(JSON.stringify({error:'invalid_client',error_description:'Invalid client type.'}),{status:401})});
 await photos.configure({clientId:clientJson.installed.client_id,clientSecret:clientJson.installed.client_secret});
 await assert.rejects(photos.startLogin(),e=>e.status===400&&/TVs und Geräte/.test(e.message)&&/invalid_client/.test(e.message));
});
test('partner access denial explains Ambient prerequisites and preserves the connected account', async t => {
 const {photos,store}=await connected(t);
 photos.fetch=async()=>new Response(JSON.stringify({error:{status:'PERMISSION_DENIED',message:'You do not have permission to perform the requested operation. Please refer to the partner program at https://developers.google.com/photos/partner-program/overview.'}}),{status:403});
 await assert.rejects(photos.connectScene(scene),e=>e.status===403&&/Partnerprogramm/.test(e.message)&&/OAuth-Anmeldung/.test(e.message));
 assert.equal(photos.status().connected,true);
 assert.equal(store.secrets.googlePhotos.devices.gallery.id,undefined);
 await assert.rejects(photos.connectScene(scene),e=>e.status===403&&/Partnerprogramm/.test(e.message),'Retry must explain the same prerequisite when cleaning up the reserved device');
 assert.equal(googleLink('https://developers.google.com/photos/partner-program/overview'),true);
 assert.equal(googleLink('https://developers.google.com/other'),false);
});
test('changing OAuth clients clears tokens and protects existing gallery bindings',async t=>{
 const {photos,store,directory}=await connected(t);
 await writeFile(path.join(directory,'client_secret.json'),JSON.stringify(clientJson));
 await photos.loadCredentials(directory);assert.equal(store.secrets.googlePhotos.refreshToken,'private-refresh','Same client retains its account connection');
 await photos.configure({clientId:'another.apps.googleusercontent.com',clientSecret:'new-secret'});assert.equal(photos.status().connected,false);
 await store.updateSecrets(s=>({...s,googlePhotos:{...s.googlePhotos,devices:{gallery:{id:'bound-device'}}}}));
 await photos.loadCredentials(directory);assert.match(photos.status().configurationError,/trennen/);assert.equal(store.secrets.googlePhotos.clientId,'another.apps.googleusercontent.com');
});
test('albums supply photo-only stack sources; pagination, refresh and restart retain binding', async t => {
 const { photos, mock, store, directory } = await connected(t); await photos.connectScene(scene); mock.pages = true;
 const result = await photos.refresh({ ...scene, googlePhotos: { mediaSourceId: 'album1' } });
 assert.equal(result.sources.length, 2); assert.equal(result.albums[0].displayName, 'Familie'); assert.equal(JSON.stringify(photos.publicGalleries()).includes('googleusercontent'), false);
 assert.equal(eligibleScenes({ scenes: [{ ...scene, sources: result.sources }] }).length, 1);
 const key = result.sources[0].split('/').at(-1); assert.deepEqual(Buffer.from(await (await photos.image(scene.id, key)).arrayBuffer()), png);
 const count = mock.calls.length; await photos.refresh(scene); assert.ok(mock.calls.length > count, 'changing album selection refreshes immediately');
 const count2 = mock.calls.length; await photos.refresh(scene); assert.equal(mock.calls.length, count2, 'ordinary tick reuses valid URLs');
 const restarted = new GooglePhotos(apiStore(await new JsonStore(directory).init(),'google-ambient'), { fetchImpl: mock.fetchImpl, now: mock.nowFn }); await restarted.refresh(scene); assert.equal(restarted.sources(scene.id).length, 1);
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
 await writeFile(path.join(directory,'client_secret.json'),JSON.stringify(clientJson));
 const server = await createWallServer({ directory, host: '127.0.0.1', port: 0, dist: path.resolve('dist'), googleCredentialsDirectory:directory, photosOptions: { fetchImpl: mock.fetchImpl, now: mock.nowFn } }); t.after(() => server.close());
 assert.equal(server.snapshot().googlePhotos.credentialSource,'client_secret.json');
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
