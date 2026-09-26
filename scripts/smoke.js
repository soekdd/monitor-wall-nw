import { spawn } from 'node:child_process';
import electron from 'electron';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,['scripts/smoke.cjs'],{stdio:'inherit',env});child.on('error',error=>{console.error(error);process.exit(1);});child.on('exit',(code,signal)=>{if(signal)console.error(`Electron ended with ${signal}`);process.exit(code??1);});
