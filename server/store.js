import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { configSchema } from './schema.js';
import { defaults } from './defaults.js';
export class JsonStore {
 constructor(directory) { this.directory=directory; this.queue=Promise.resolve(); }
 async init() { await mkdir(path.join(this.directory,'media'),{recursive:true}); try { this.config=configSchema.parse(JSON.parse(await readFile(path.join(this.directory,'settings.json'),'utf8'))); } catch(e) { if(e.code!=='ENOENT') throw new Error(`settings.json ist ungültig: ${e.message}`); this.config=defaults(); await this.atomic('settings.json',this.config); } try { this.secrets=JSON.parse(await readFile(path.join(this.directory,'secrets.json'),'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; this.secrets={}; } return this; }
 async atomic(file,value) { const dest=path.join(this.directory,file); const temp=`${dest}.tmp`; await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600}); await rename(temp,dest); }
 update(config) { const parsed=configSchema.parse(config); const op=this.queue.then(async()=>{await this.atomic('settings.json',parsed);this.config=parsed;return parsed;}); this.queue=op.catch(()=>{}); return op; }
 updateSecrets(update) { const op=this.queue.then(async()=>{const secrets=update(this.secrets);await this.atomic('secrets.json',secrets);this.secrets=secrets;});this.queue=op.catch(()=>{});return op; }
 saveSecrets(secrets) { const op=this.queue.then(async()=>{await this.atomic('secrets.json',secrets);this.secrets=secrets;});this.queue=op.catch(()=>{});return op; }
}
