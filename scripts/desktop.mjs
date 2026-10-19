import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'});
let electron;
const stop=()=>{electron?.kill();vite.kill();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',stop);
let ready=false;
for(let i=0;i<80;i++){
  try{const response=await fetch('http://127.0.0.1:5173');if(response.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
}
if(!ready){stop();throw new Error('Vite không khởi động được.');}
electron=spawn(require('electron'),['.'],{stdio:'inherit'});
electron.on('error',error=>{console.error(error.message);stop();process.exitCode=1;});
electron.on('exit',code=>{vite.kill();process.exitCode=code||0;});
