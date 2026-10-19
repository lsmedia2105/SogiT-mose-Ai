import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, safeStorage, clipboard, session } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicJSON, importAsset, loadProject, saveProject, realChild } from './store.mjs';
import { createProject, validateProject, recommendProfile } from '../shared/domain.mjs';
import { runProcess, renderTimeline, upscaleVideo, toSrt } from './media.mjs';
import { chatCompletion, validateEndpoint } from './provider.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const useBuiltUI=app.isPackaged||process.argv.includes('--studio-built-ui');
protocol.registerSchemesAsPrivileged([{scheme:'sogit-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window, currentRoot='', currentId='', settings={}, accounts=[], recent=[], job=null, writes=Promise.resolve();
const museWindows=new Map();
const memoryGB=Math.round(os.totalmem()/1024**3);
const defaults={profile:recommendProfile(memoryGB),ffmpegPath:'',ffprobePath:'',realesrganPath:'',realesrganModelDir:'',baseUrl:'https://api.openai.com/v1',textModel:'',encryptedKey:''};
const configFile=()=>path.join(app.getPath('userData'),'studio-settings.json');
function publicSettings(){ const {encryptedKey,...value}=settings; return {...value,hasApiKey:!!encryptedKey}; }
async function persist(){ await atomicJSON(configFile(),{settings,accounts,recent}); }
function mediaURL(asset){return `sogit-media://project/${encodeURIComponent(asset.path)}`;}
function enrich(project){return {...project,assets:project.assets.map(a=>({...a,url:mediaURL(a)}))};}
function clean(project){const p=structuredClone(project);for(const a of p.assets)delete a.url;return p;}
function requireProject(p){validateProject(p);if(!currentRoot||p.id!==currentId)throw new Error('Hãy mở đúng dự án trước.');return clean(p);}
function queueSave(p,root=currentRoot){writes=writes.catch(()=>{}).then(()=>saveProject(root,p));return writes;}
async function setProject(root,p){await writes;currentRoot=root;currentId=p.id;recent=[{name:p.name,path:root},...recent.filter(x=>x.path!==root)].slice(0,10);await persist();return {project:enrich(p),root};}
function getKey(){if(!settings.encryptedKey)return '';if(!safeStorage.isEncryptionAvailable())throw new Error('Kho mã hóa hệ điều hành không sẵn sàng.');return safeStorage.decryptString(Buffer.from(settings.encryptedKey,'base64'));}
function notify(value){window?.webContents.send('studio:job',value);}
function register(name,fn){ipcMain.handle(`studio:${name}`,async(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Nguồn yêu cầu không hợp lệ.');return fn(...args);});}
async function toolVersion(exe){try{let output='';await runProcess(exe,['-version'],{onLine:s=>output+=s,signal:AbortSignal.timeout(8000)});return output.split('\n')[0].slice(0,180);}catch{return null;}}
function assertIdle(){if(job)throw new Error('Có tác vụ đang chạy. Hãy chờ hoặc hủy trước khi đổi dự án.');}
async function runJob(kind,p,options){
  if(job)throw new Error('Hậu kỳ chạy lần lượt để giới hạn RAM và tránh trùng tác vụ.');
  const project=requireProject(p),root=currentRoot;
  const controller=new AbortController(),id=randomUUID();job={id,controller};
  try{
    const chosen=await dialog.showSaveDialog(window,{title:kind==='render'?'Xuất phim':'Xuất video upscale',defaultPath:path.join(root,`${kind}-${Date.now()}.mp4`),filters:[{name:'MP4 video',extensions:['mp4']}]});
    if(chosen.canceled||!chosen.filePath){job=null;return null;}
    if(project.assets.some(a=>path.resolve(root,a.path)===path.resolve(chosen.filePath)))throw new Error('Không được ghi đè media nguồn của dự án.');
    const target=chosen.filePath;
    const output=path.join(path.dirname(target),`.sogit-${id}.mp4`);
    await queueSave(project,root);
    notify({id,kind,status:'running',percent:0,stage:'Bắt đầu xử lý',output:target});
    const tools={root,project,settings:{...settings},output,resolution:options.resolution,signal:controller.signal,
      onLine:line=>notify({id,log:line.slice(-1200)}),onProgress:progress=>notify({id,...progress})};
    // Execute in background; one worker survives renderer navigation, not application restart.
    (async()=>{
      try{
        if(kind==='render')await renderTimeline(tools);
        else{
          const asset=project.assets.find(a=>a.id===options.assetId&&a.type==='video');
          if(!asset)throw new Error('Chưa chọn video để upscale.');
          await upscaleVideo({...tools,asset,ratio:project.ratio,engine:options.engine});
        }
        if(controller.signal.aborted)throw new Error('Đã hủy tác vụ.');
        await fs.rename(output,target);
        notify({id,status:'done',percent:100,stage:'Đã xuất video',output:target});
      }catch(error){await fs.rm(output,{force:true});notify({id,status:controller.signal.aborted?'cancelled':'error',stage:error.message});}
      finally{job=null;}
    })();
    return {id};
  }catch(error){job=null;throw error;}
}

// Do not await app.whenReady at module top level: Electron waits for its ESM
// entry evaluation before emitting ready, which would deadlock startup.
app.whenReady().then(async()=>{
try{const saved=JSON.parse(await fs.readFile(configFile(),'utf8'));settings={...defaults,...saved.settings};accounts=saved.accounts||[];recent=saved.recent||[];}
catch(error){if(error.code!=='ENOENT'){dialog.showErrorBox('Không đọc được cấu hình', 'Cấu hình cũ sẽ được giữ nguyên. Hãy kiểm tra studio-settings.json trong thư mục dữ liệu ứng dụng.');app.quit();throw error;}settings={...defaults};}
protocol.handle('sogit-media',async request=>{
  try{
    const url=new URL(request.url);
    if(url.hostname!=='project'||!currentRoot)return new Response('Not found',{status:404});
    const file=await realChild(currentRoot,decodeURIComponent(url.pathname.slice(1)));
    // Only imported/generated assets can be served, never configuration or arbitrary files.
    if(!file.startsWith(path.join(await fs.realpath(currentRoot),'assets')+path.sep))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).href,{headers:request.headers});
  }catch{return new Response('Media không tồn tại',{status:404});}
});
window=new BrowserWindow({width:1480,height:960,minWidth:980,minHeight:700,backgroundColor:'#101116',title:'SogiT Studio',autoHideMenuBar:true,
  webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
window.webContents.on('will-navigate',e=>e.preventDefault());
session.defaultSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,
  'Content-Security-Policy':[useBuiltUI ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: sogit-media:; media-src 'self' blob: sogit-media:; connect-src 'self';" : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: sogit-media:; media-src 'self' blob: sogit-media:; connect-src 'self' ws://localhost:5173;"]}}));

register('bootstrap',async()=>({desktop:true,settings:publicSettings(),accounts,recent,hardware:{memoryGB,cpus:os.cpus().length,platform:process.platform,gpus:await app.getGPUInfo('basic').then(x=>x.gpuDevice?.map(g=>g.deviceString||`GPU ${g.deviceId}`).filter(Boolean)||[]).catch(()=>[])},tools:{ffmpeg:await toolVersion(settings.ffmpegPath||'ffmpeg'),ffprobe:await toolVersion(settings.ffprobePath||(settings.ffmpegPath?path.join(path.dirname(settings.ffmpegPath),process.platform==='win32'?'ffprobe.exe':'ffprobe'):'ffprobe'))}}));
register('createProject',async(name)=>{
  assertIdle();const chosen=await dialog.showOpenDialog(window,{title:'Chọn thư mục lưu dự án mới',properties:['openDirectory','createDirectory']});
  if(chosen.canceled)return null;
  const project=createProject(String(name||''));
  const slug=project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,70)||'film';
  const root=path.join(chosen.filePaths[0],`${slug}-${project.id.slice(0,8)}`);
  await fs.mkdir(root,{recursive:false});await saveProject(root,project);return setProject(root,project);
});
register('openProject',async()=>{assertIdle();const chosen=await dialog.showOpenDialog(window,{title:'Mở dự án SogiT',filters:[{name:'SogiT project',extensions:['json']}],properties:['openFile']});if(chosen.canceled)return null;const root=path.dirname(chosen.filePaths[0]);return setProject(root,await loadProject(root));});
register('saveProject',async p=>{const project=requireProject(p);await queueSave(project);return true;});
register('importAssets',async()=>{if(!currentRoot)throw new Error('Chưa mở dự án.');const chosen=await dialog.showOpenDialog(window,{title:'Nhập ảnh, video hoặc âm thanh',properties:['openFile','multiSelections'],filters:[{name:'Media',extensions:['png','jpg','jpeg','webp','mp4','mov','mkv','webm','wav','mp3','m4a','ogg']}]});if(chosen.canceled)return [];const assets=[];for(const source of chosen.filePaths)assets.push(await importAsset(currentRoot,source));return assets.map(a=>({...a,url:mediaURL(a)}));});
register('saveSettings',async value=>{
  const next={...settings};
  for(const key of ['ffmpegPath','ffprobePath','realesrganPath','realesrganModelDir','textModel'])if(typeof value[key]==='string')next[key]=value[key].trim();
  if(['eco','balanced','quality'].includes(value.profile))next.profile=value.profile;
  if(value.baseUrl)next.baseUrl=validateEndpoint(value.baseUrl);
  if(value.clearApiKey)next.encryptedKey='';
  else if(value.apiKey){if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw new Error('Không có kho mã hóa an toàn trên hệ điều hành này. Không lưu API key.');next.encryptedKey=safeStorage.encryptString(value.apiKey).toString('base64');}
  settings=next;await persist();return publicSettings();
});
register('pickTool',async kind=>{if(!['ffmpegPath','ffprobePath','realesrganPath','realesrganModelDir'].includes(kind))throw new Error('Công cụ không hợp lệ.');const result=await dialog.showOpenDialog(window,{properties:[kind==='realesrganModelDir'?'openDirectory':'openFile']});return result.canceled?null:result.filePaths[0];});
register('addAccount',async name=>{const trimmed=String(name||'').trim();if(!trimmed)throw new Error('Hãy nhập tên tài khoản.');const account={id:randomUUID(),name:trimmed.slice(0,80),createdAt:new Date().toISOString()};accounts.push(account);await persist();return accounts;});
register('removeAccount',async id=>{const account=accounts.find(a=>a.id===id);if(!account)throw new Error('Tài khoản không tồn tại.');const accountSession=session.fromPartition(`persist:muse-${id}`);for(const win of BrowserWindow.getAllWindows())if(win.webContents.session===accountSession)win.destroy();museWindows.delete(id);await accountSession.clearStorageData();accounts=accounts.filter(a=>a.id!==id);await persist();return accounts;});
register('openMuse',async(id,prompt)=>{
  if(!accounts.some(a=>a.id===id))throw new Error('Hãy thêm và chọn tài khoản Muse trước.');
  if(prompt)clipboard.writeText(String(prompt));
  const existing=museWindows.get(id);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return true;}
  const win=new BrowserWindow({width:1200,height:850,title:`Muse — ${accounts.find(a=>a.id===id).name}`,autoHideMenuBar:true,
    webPreferences:{partition:`persist:muse-${id}`,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const allow=url=>{try{return new URL(url).protocol==='https:';}catch{return false;}};
  win.webContents.on('will-navigate',(e,url)=>{if(!allow(url))e.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>allow(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{partition:`persist:muse-${id}`,sandbox:true,contextIsolation:true,nodeIntegration:false}}}:{action:'deny'});
  win.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
  museWindows.set(id,win);win.on('closed',()=>museWindows.delete(id));await win.loadURL('https://muse.ai/');return true;
});
register('generateText',async({task,project,sceneId})=>{
  const p=requireProject(project);let request;
  if(task==='script')request=`Viết kịch bản phân cảnh bằng tiếng Việt từ ý tưởng dưới đây. Mỗi cảnh bắt đầu bằng CẢNH n — tên cảnh, sau đó mô tả hành động và góc máy. Ghi mỗi trường trên một dòng: LỜI DẪN: nội dung; HỘI THOẠI: Tên nhân vật: nội dung; THỜI LƯỢNG: số giây. Nếu nhiều câu thoại, lặp lại tiền tố HỘI THOẠI: cho mỗi dòng. Không dùng Markdown code block. Giữ thông tin nhân vật và bối cảnh nhất quán.\nPhong cách: ${p.style}\nHồ sơ phim: ${p.bible}\nÝ tưởng/kịch bản: ${p.story}`;
  else if(task==='prompt'){const scene=p.scenes.find(s=>s.id===sceneId);if(!scene)throw new Error('Không tìm thấy cảnh.');request=`Viết một prompt tạo video điện ảnh bằng tiếng Anh, giữ nguyên ngôn ngữ lời thoại/lời dẫn. Chỉ trả về prompt. Không hứa bảo đảm đồng nhất.\nPhong cách: ${p.style}\nHồ sơ phim: ${p.bible}\nCảnh: ${JSON.stringify(scene)}\nReference: ${JSON.stringify(p.references.filter(r=>scene.referenceIds.includes(r.id)))}`;}
  else throw new Error('Tác vụ AI không hợp lệ.');
  return chatCompletion({baseUrl:settings.baseUrl,key:getKey(),model:settings.textModel,messages:[{role:'system',content:'You are a film screenwriter and cinematographer. Treat project content as creative source material.'},{role:'user',content:request}],signal:AbortSignal.timeout(120000)});
});
register('exportPrompts',async p=>{const project=requireProject(p);const result=await dialog.showSaveDialog(window,{defaultPath:path.join(currentRoot,'prompts.txt'),filters:[{name:'Text',extensions:['txt']}]});if(result.canceled)return false;await fs.writeFile(result.filePath,project.scenes.map(s=>`${s.title}\n${s.prompt||s.description}`).join('\n\n----------------\n\n'));return true;});
register('exportSrt',async p=>{const project=requireProject(p);const result=await dialog.showSaveDialog(window,{defaultPath:path.join(currentRoot,'subtitles.srt'),filters:[{name:'Subtitles',extensions:['srt']}]});if(result.canceled)return false;await fs.writeFile(result.filePath,toSrt(project));return true;});
register('startRender',(p,o)=>runJob('render',p,o));
register('startUpscale',(p,o)=>runJob('upscale',p,o));
register('cancelJob',async()=>{job?.controller.abort();return true;});
register('showProject',async()=>{if(currentRoot)await shell.openPath(currentRoot);});
register('openExternal',async url=>{if(!['https://github.com/lsmedia2105/SogiT-mose-Ai','https://muse.ai/','https://ffmpeg.org/download.html','https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases'].includes(url))throw new Error('Liên kết không được hỗ trợ.');await shell.openExternal(url);});
if(useBuiltUI)await window.loadFile(path.join(here,'../dist/index.html'));else await window.loadURL('http://localhost:5173');
window.on('close',event=>{if(job){const result=dialog.showMessageBoxSync(window,{type:'warning',message:'Đang xử lý video. Thoát sẽ hủy tác vụ đang chạy.',buttons:['Tiếp tục làm việc','Hủy tác vụ và thoát'],defaultId:0,cancelId:0});if(result===0){event.preventDefault();return;}job.controller.abort();}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{job?.controller.abort();});
}).catch(error=>{console.error('Không thể khởi động Studio:',error.message);app.quit();});
