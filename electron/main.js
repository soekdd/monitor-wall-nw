import { app, BrowserWindow, screen, Menu, shell } from 'electron';
import path from 'node:path';
import { googleLink } from '../server/google-photos.js';
import { createWallServer } from '../server/app.js';
import { editMenu, installEditingContextMenu } from './editing.js';
const windows=new Map();let service,admin,closing=false,showAdmin=()=>{};
if(!app.requestSingleInstanceLock())app.quit();else {
 app.on('second-instance',()=>{showAdmin();});
 app.whenReady().then(async()=>{
 const port=Number(process.env.WALL_PORT)||3210;
 const local=route=>`http://127.0.0.1:${port}${route}#token=${service.token}`;
 const available=()=>screen.getAllDisplays().map(d=>({id:String(d.id),name:d.label||`Display ${d.id}`,bounds:d.bounds,scaleFactor:d.scaleFactor,primary:d.id===screen.getPrimaryDisplay().id}));
 function createWindow(options,route) {const win=new BrowserWindow({...options,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});installEditingContextMenu(win);win.webContents.setWindowOpenHandler(({url})=>{if(googleLink(url))void shell.openExternal(url);return{action:'deny'};});win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(`http://127.0.0.1:${port}/`))event.preventDefault();});win.loadURL(local(route));return win;}
 function sync(config){for(const [id,win]of windows){const m=config.monitors.find(m=>m.id===id&&m.enabled);const d=m&&screen.getAllDisplays().find(d=>String(d.id)===m.displayId);if(!d){win.close();windows.delete(id);}else win.setBounds(d.bounds);}for(const m of config.monitors.filter(m=>m.enabled&&m.displayId)){const d=screen.getAllDisplays().find(d=>String(d.id)===m.displayId);if(d&&!windows.has(m.id)){const win=createWindow({ ...d.bounds,frame:false,fullscreen:true,backgroundColor:'#000',autoHideMenuBar:true },`/wall?monitor=${m.id}`);windows.set(m.id,win);win.on('closed',()=>windows.delete(m.id));win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'){win.setFullScreen(false);showAdmin();event.preventDefault();}});}}}
 service=await createWallServer({directory:process.env.WALL_DATA_DIR||path.join(app.getPath('userData'),'data'),port,frontend:process.env.WALL_DEV==='1',dist:path.join(app.getAppPath(),'dist'),googleCredentialsDirectory:path.join(app.getAppPath(),'config'),googleCredentialsFile:process.env.WALL_GOOGLE_OAUTH_FILE,googlePickerCredentialsFile:process.env.WALL_GOOGLE_PICKER_OAUTH_FILE,displays:available,onDisplays:sync});
 showAdmin=()=>{if(!admin){admin=createWindow({width:1440,height:960,minWidth:420,minHeight:640,backgroundColor:'#101617'},'/admin');admin.on('closed',()=>{admin=null;});}admin.show();admin.focus();};showAdmin();sync(service.store.config);
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Monitor Wall',submenu:[{label:'Verwaltung',click:showAdmin},{label:'Bilderwand starten',click:()=>sync(service.store.config)},{type:'separator'},{role:'quit'}]},editMenu,{label:'Ansicht',submenu:[{role:'reload'},{role:'toggleDevTools'},{role:'togglefullscreen'}]}]));
 for(const e of ['display-added','display-removed','display-metrics-changed'])screen.on(e,()=>{sync(service.store.config);service.broadcast();});
 }).catch(error=>{console.error(error);app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(service&&!closing){event.preventDefault();closing=true;service.close().finally(()=>app.quit());}});
}
