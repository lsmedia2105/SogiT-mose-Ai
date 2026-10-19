import { normalizeProject, displayTitle, effectiveReferenceIds, shotLabels, orderedShots } from '../shared/structure.mjs';
import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, safeStorage, clipboard, session, nativeImage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicJSON, importAsset, loadProject, saveProject, realChild } from './store.mjs';
import { createProject, validateProject, recommendProfile, buildImagePrompt, buildPrompt, buildShotlistPrompt } from '../shared/domain.mjs';
import { applyGeneratedResults } from '../shared/generation.mjs';
import { generateMuse, inspectMuse, diagnoseMuse, downloadMuseMedia } from './muse.mjs';
import { runQueue, taskRecord, interruptedHistory } from './muse-queue.mjs';
import { runProcess, renderTimeline, upscaleVideo, toSrt } from './media.mjs';
import { chatCompletion, validateEndpoint } from './provider.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const useBuiltUI=app.isPackaged||process.argv.includes('--studio-built-ui');
protocol.registerSchemesAsPrivileged([{scheme:'sogit-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window, currentRoot='', currentId='', settings={}, accounts=[], recent=[], job=null, writes=Promise.resolve();
const museWindows=new Map();
let museRun=null,generated={projectId:'',entries:[]};
const memoryGB=Math.round(os.totalmem()/1024**3);
const defaults={profile:recommendProfile(memoryGB),ffmpegPath:'',ffprobePath:'',realesrganPath:'',realesrganModelDir:'',baseUrl:'https://api.openai.com/v1',textModel:'',encryptedKey:'',museComposer:'',museSend:'',museResult:'',museFile:'',museTimeout:10};
const configFile=()=>path.join(app.getPath('userData'),'studio-settings.json');
function publicSettings(){ const {encryptedKey,...value}=settings; return {...value,hasApiKey:!!encryptedKey}; }
async function persist(){ await atomicJSON(configFile(),{settings,accounts,recent}); }
function mediaURL(asset){return `sogit-media://project/${encodeURIComponent(asset.path)}`;}
function enrich(project){return {...project,assets:project.assets.map(a=>({...a,url:mediaURL(a)}))};}
function clean(project){const p=structuredClone(project);for(const a of p.assets)delete a.url;return p;}
function requireProject(p){validateProject(p);if(!currentRoot||p.id!==currentId)throw new Error('Hãy mở đúng dự án trước.');return normalizeProject(clean(p));}
function mergeResults(p){return generated.projectId===p.id?applyGeneratedResults(p,generated.entries):p;}
function queueSave(p,root=currentRoot){writes=writes.catch(()=>{}).then(()=>saveProject(root,mergeResults(p)));return writes;}
async function setProject(root,p){await writes;currentRoot=root;currentId=p.id;generated={projectId:p.id,entries:[]};recent=[{name:p.name,path:root},...recent.filter(x=>x.path!==root)].slice(0,10);await persist();return {project:enrich(p),root};}
function getKey(){if(!settings.encryptedKey)return '';if(!safeStorage.isEncryptionAvailable())throw new Error('Kho mã hóa hệ điều hành không sẵn sàng.');return safeStorage.decryptString(Buffer.from(settings.encryptedKey,'base64'));}
function notify(value){window?.webContents.send('studio:job',value);}
function register(name,fn){ipcMain.handle(`studio:${name}`,async(event,...args)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Nguồn yêu cầu không hợp lệ.');return fn(...args);});}
async function toolVersion(exe){try{let output='';await runProcess(exe,['-version'],{onLine:s=>output+=s,signal:AbortSignal.timeout(8000)});return output.split('\n')[0].slice(0,180);}catch{return null;}}
function assertIdle(){if(job||museRun)throw new Error('Có tác vụ đang chạy. Hãy chờ hoặc dừng trước khi đổi dự án.');}
async function runJob(kind,p,options){
  if(job||museRun)throw new Error('Có tác vụ đang chạy. Hãy chờ hoặc dừng trước khi xuất.');
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
  for(const key of ['ffmpegPath','ffprobePath','realesrganPath','realesrganModelDir','textModel','museComposer','museSend','museResult','museFile'])if(typeof value[key]==='string')next[key]=value[key].trim();
  if(['eco','balanced','quality'].includes(value.profile))next.profile=value.profile;
  if(Number.isFinite(value.museTimeout))next.museTimeout=Math.max(1,Math.min(30,value.museTimeout));
  if(value.baseUrl)next.baseUrl=validateEndpoint(value.baseUrl);
  if(value.clearApiKey)next.encryptedKey='';
  else if(value.apiKey){if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw new Error('Không có kho mã hóa an toàn trên hệ điều hành này. Không lưu API key.');next.encryptedKey=safeStorage.encryptString(value.apiKey).toString('base64');}
  settings=next;await persist();return publicSettings();
});
register('pickTool',async kind=>{if(!['ffmpegPath','ffprobePath','realesrganPath','realesrganModelDir'].includes(kind))throw new Error('Công cụ không hợp lệ.');const result=await dialog.showOpenDialog(window,{properties:[kind==='realesrganModelDir'?'openDirectory':'openFile']});return result.canceled?null:result.filePaths[0];});
register('addAccount',async name=>{const trimmed=String(name||'').trim();if(!trimmed)throw new Error('Hãy nhập tên tài khoản.');const account={id:randomUUID(),name:trimmed.slice(0,80),createdAt:new Date().toISOString()};accounts.push(account);await persist();return accounts;});
register('removeAccount',async id=>{if(museRun)throw new Error('Dừng hàng đợi Muse trước khi xóa tài khoản.');const account=accounts.find(a=>a.id===id);if(!account)throw new Error('Tài khoản không tồn tại.');const accountSession=session.fromPartition(`persist:muse-${id}`);for(const win of BrowserWindow.getAllWindows())if(win.webContents.session===accountSession)win.destroy();museWindows.delete(id);await accountSession.clearStorageData();accounts=accounts.filter(a=>a.id!==id);await persist();return accounts;});
async function getMuseWindow(id){
  if(!accounts.some(a=>a.id===id))throw new Error('Hãy thêm và chọn tài khoản Muse trước.');
  const existing=museWindows.get(id);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return existing;}
  const win=new BrowserWindow({width:1200,height:850,title:`Muse — ${accounts.find(a=>a.id===id).name}`,autoHideMenuBar:true,
    webPreferences:{partition:`persist:muse-${id}`,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const allow=url=>{try{return new URL(url).protocol==='https:';}catch{return false;}};
  win.webContents.on('will-navigate',(e,url)=>{if(!allow(url))e.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>allow(url)?{action:'allow',overrideBrowserWindowOptions:{webPreferences:{partition:`persist:muse-${id}`,sandbox:true,contextIsolation:true,nodeIntegration:false}}}:{action:'deny'});
  win.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
  museWindows.set(id,win);win.on('closed',()=>museWindows.delete(id));await win.loadURL('https://muse.ai/');return win;
}
register('openMuse',async(id,prompt)=>{if(prompt)clipboard.writeText(String(prompt));await getMuseWindow(id);return true;});
const museSelectors=()=>({composer:settings.museComposer,send:settings.museSend,result:settings.museResult,file:settings.museFile});
const museNotify=value=>window?.webContents.send('studio:muse',value);
async function historyFile(root){await fs.mkdir(path.join(root,'.sogit'),{recursive:true});const dir=await realChild(root,'.sogit');return path.join(dir,'muse-history.json');}
async function readHistory(root){try{return JSON.parse(await fs.readFile(await historyFile(root),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
register('museCheck',async id=>{const win=await getMuseWindow(id);return inspectMuse(win,museSelectors());});
register('museReport',async id=>{const win=await getMuseWindow(id),report=await diagnoseMuse(win,museSelectors());const chosen=await dialog.showSaveDialog(window,{title:'Lưu báo cáo nhận diện Muse — không có nội dung chat hoặc token',defaultPath:'muse-diagnostics.json',filters:[{name:'JSON',extensions:['json']}]});if(chosen.canceled)return false;await atomicJSON(chosen.filePath,{version:app.getVersion(),createdAt:new Date().toISOString(),...report});return true;});
register('museHistory',async()=>{if(!currentRoot)return [];const items=await readHistory(currentRoot);if(museRun)return items;const recovered=interruptedHistory(items);await atomicJSON(await historyFile(currentRoot),recovered);return recovered;});
register('museStart',async(p,options)=>{
  if(job||museRun)throw new Error('Đang có tác vụ. Dừng hoặc chờ hoàn tất trước.');
  const project=requireProject(p),root=currentRoot,kind=options.kind,labels=shotLabels(project);
  if(!['image','video','reference','script'].includes(kind))throw new Error('Loại tạo nội dung không hợp lệ.');
  const accountFor=target=>{const id=options.accountId||target?.accountId||(accounts.length===1?accounts[0].id:'');if(!accounts.some(a=>a.id===id))throw new Error('Chọn tài khoản Muse đã đăng nhập.');return id;};
  let tasks=[];
  if(kind==='script'){
    if(!project.story.trim())throw new Error('Nhập kịch bản trước khi nhờ Muse chia shot.');
    tasks=[taskRecord({kind,accountId:accountFor(),title:'Muse phân tích và chia shot',prompt:buildShotlistPrompt(project,Number(options.maxShotDuration)||8),referencePaths:[]})];
  }else if(kind==='reference'){
    const ref=project.references.find(r=>r.id===options.referenceId);if(!ref)throw new Error('Lưu reference trước khi tạo ảnh.');
    if(ref.locked)throw new Error('Mở khóa reference trước khi tạo phiên bản mới.');
    const input=project.assets.find(a=>a.id===ref.assetId&&a.type==='image');
    tasks=[taskRecord({kind:'image',targetType:'reference',targetId:ref.id,accountId:accountFor(),title:`Reference: ${ref.name}`,referencePaths:input?[input.path]:[],prompt:`Generate one finished cinematic reference sheet IMAGE now for ${ref.kind}: ${ref.name}. ${ref.description}. Style: ${project.style}. World: ${project.bible}. If an image is attached, preserve its identity. Show useful consistent views; return the generated image, not instructions.`})];
  }else{
    const ids=[...new Set(options.sceneIds||[])];if(!ids.length||ids.length>200)throw new Error('Chọn từ 1 đến 200 shot mỗi lượt.');
    const unresolved=(await readHistory(root)).filter(item=>['uncertain','interrupted','sending','sent','downloading'].includes(item.status));
    if(ids.length>1&&ids.some(id=>unresolved.some(item=>item.targetId===id)))throw new Error('Có shot chưa rõ kết quả từ lần trước. Kiểm tra Muse và xử lý từng shot trước khi chạy lại hàng loạt.');
    tasks=ids.map(id=>{
      const scene=project.scenes.find(s=>s.id===id);if(!scene)throw new Error('Shot không còn trong dự án.');
      const selectedRefs=project.references.filter(r=>effectiveReferenceIds(project,scene).includes(r.id));
      const missing=selectedRefs.find(r=>r.kind!=='Phong cách'&&!project.assets.some(a=>a.id===r.assetId&&a.type==='image'));
      if(missing)throw new Error(`Reference ${missing.name} chưa có ảnh. Upload hoặc tạo ảnh reference trước khi chạy shot.`);
      const attached=selectedRefs.map(r=>project.assets.find(a=>a.id===r.assetId&&a.type==='image')).filter(Boolean);
      if(kind==='video'&&scene.selectedImageAssetId){const storyboard=project.assets.find(a=>a.id===scene.selectedImageAssetId&&a.type==='image');if(storyboard)attached.push(storyboard);}
      return taskRecord({kind,targetType:'scene',targetId:scene.id,accountId:accountFor(scene),title:`${labels[scene.id].code} — ${displayTitle(scene.title,'shot')}`,
        prompt:kind==='image'?buildImagePrompt(project,scene):`Generate the finished VIDEO now, not just instructions. Use the attached storyboard/reference images.\n${scene.prompt||buildPrompt(project,scene)}`,
        referencePaths:[...new Set(attached.map(a=>a.path))]});
    });
  }
  const id=randomUUID(),controller=new AbortController();museRun={id,controller};
  try{
    await queueSave(project,root);
    const previous=(await readHistory(root)).slice(-300),file=await historyFile(root),selectors=museSelectors();
    const persistHistory=()=>atomicJSON(file,[...previous,...tasks].slice(-500));await persistHistory();
    museNotify({id,projectId:project.id,status:'running',stage:`Đang chuẩn bị ${tasks.length} tác vụ Muse`,percent:0,items:tasks});
    (async()=>{
      try{
        const summary=await runQueue({tasks,signal:controller.signal,persist:persistHistory,
          onUpdate:(item,index)=>museNotify({id,projectId:project.id,status:'running',stage:`${index+1}/${tasks.length} · ${item.title} · ${{queued:'chờ',attaching:'gắn reference',sending:'đang gửi',sent:'đợi Muse',downloading:'nhận kết quả',done:'đã lưu',error:'lỗi',uncertain:'chưa rõ kết quả'}[item.status]||item.status}`,percent:Math.round(index/tasks.length*100),items:tasks}),
          perform:async(item,onState)=>{
            const win=await getMuseWindow(item.accountId);controller.signal.throwIfAborted();
            const files=await Promise.all(item.referencePaths.map(relative=>realChild(root,relative)));
            const result=await generateMuse({win,prompt:item.prompt,kind:item.kind,files,selectors,signal:controller.signal,onState,timeoutMs:(settings.museTimeout||10)*60000});
            if(item.kind==='script'){museNotify({id,projectId:project.id,script:result.text});return {resultText:result.text};}
            const asset=await downloadMuseMedia({win,src:result.src,kind:item.kind,root,signal:controller.signal,decodeImage:nativeImage.createFromBuffer});
            asset.name=`${item.title} — ${item.kind} ${asset.id.slice(0,8)}${path.extname(asset.path)}`;
            const entry={targetType:item.targetType,targetId:item.targetId,asset};generated.entries.push(entry);
            await writes;const latest=await loadProject(root);await queueSave(latest,root);
            museNotify({id,projectId:project.id,entries:[{...entry,asset:{...asset,url:mediaURL(asset)}}]});
            return {assetId:asset.id};
          }});
        museNotify({id,projectId:project.id,...summary,percent:summary.status==='done'?100:Math.round(summary.done/summary.total*100),stage:summary.status==='done'?`Đã lưu ${summary.done}/${summary.total} kết quả Muse`:`Dừng hàng đợi · đã lưu ${summary.done}/${summary.total}. Xem nhật ký và kiểm tra Muse.`,items:tasks});
      }catch(error){museNotify({id,projectId:project.id,status:'error',stage:error.message,items:tasks});}
      finally{museRun=null;}
    })();return {id};
  }catch(error){museRun=null;throw error;}
});

register('generateText',async({task,project,sceneId})=>{
  const p=requireProject(project);let request;
  if(task==='script')request=buildShotlistPrompt(p,8);
  else if(task==='prompt'){const scene=p.scenes.find(s=>s.id===sceneId);if(!scene)throw new Error('Không tìm thấy cảnh.');request=`Viết một prompt tạo video điện ảnh bằng tiếng Anh, giữ nguyên ngôn ngữ lời thoại/lời dẫn. Chỉ trả về prompt. Không hứa bảo đảm đồng nhất.\nPhong cách: ${p.style}\nHồ sơ phim: ${p.bible}\nCảnh: ${JSON.stringify(scene)}\nReference: ${JSON.stringify(p.references.filter(r=>effectiveReferenceIds(p,scene).includes(r.id)))}`;}
  else throw new Error('Tác vụ AI không hợp lệ.');
  return chatCompletion({baseUrl:settings.baseUrl,key:getKey(),model:settings.textModel,messages:[{role:'system',content:'You are a film screenwriter and cinematographer. Treat project content as creative source material.'},{role:'user',content:request}],signal:AbortSignal.timeout(120000)});
});
register('exportPrompts',async p=>{const project=requireProject(p),labels=shotLabels(project);const result=await dialog.showSaveDialog(window,{defaultPath:path.join(currentRoot,'prompts.txt'),filters:[{name:'Text',extensions:['txt']}]});if(result.canceled)return false;await fs.writeFile(result.filePath,orderedShots(project).map(s=>`${labels[s.id].code} — ${displayTitle(s.title,'shot')}\n${s.prompt||s.description}`).join('\n\n----------------\n\n'));return true;});
register('exportSrt',async p=>{const project=requireProject(p);const result=await dialog.showSaveDialog(window,{defaultPath:path.join(currentRoot,'subtitles.srt'),filters:[{name:'Subtitles',extensions:['srt']}]});if(result.canceled)return false;await fs.writeFile(result.filePath,toSrt(project));return true;});
register('exportShotMedia',async(p,shotId,assetId)=>{
  const project=requireProject(p),shot=project.scenes.find(s=>s.id===shotId),asset=project.assets.find(a=>a.id===assetId);
  if(!shot||!asset||!([...shot.imageVersions||[],...shot.versions.map(v=>v.assetId),shot.selectedImageAssetId].includes(assetId)))throw new Error('Media không thuộc shot đã chọn.');
  const chosen=await dialog.showSaveDialog(window,{defaultPath:`${shotLabels(project)[shot.id].code}-${asset.type}${path.extname(asset.path)}`});if(chosen.canceled)return false;
  const source=await realChild(currentRoot,asset.path);if(path.resolve(chosen.filePath)===path.resolve(source))throw new Error('Chọn nơi lưu khác media gốc.');await fs.copyFile(source,chosen.filePath);return true;
});
register('exportAllShotMedia',async p=>{
  const project=requireProject(p),chosen=await dialog.showOpenDialog(window,{title:'Chọn nơi tải kết quả đã chọn theo cảnh / shot',properties:['openDirectory','createDirectory']});if(chosen.canceled)return false;
  const root=path.join(chosen.filePaths[0],`SogiT-shots-${Date.now()}-${randomUUID().slice(0,6)}`),labels=shotLabels(project);let count=0;
  for(const shot of orderedShots(project))for(const id of [shot.selectedImageAssetId,shot.versions.find(v=>v.id===shot.selectedVersionId)?.assetId].filter(Boolean)){
    const asset=project.assets.find(a=>a.id===id);if(!asset)continue;const label=labels[shot.id],dir=path.join(root,label.sceneCode);await fs.mkdir(dir,{recursive:true});await fs.copyFile(await realChild(currentRoot,asset.path),path.join(dir,`${label.code}-${asset.type}${path.extname(asset.path)}`));count++;
  }
  if(!count)throw new Error('Chưa có ảnh / video đã chọn để tải.');await shell.openPath(root);return true;
});
register('startRender',(p,o)=>runJob('render',p,o));
register('startUpscale',(p,o)=>runJob('upscale',p,o));
register('cancelJob',async()=>{job?.controller.abort();museRun?.controller.abort();return true;});
register('showProject',async()=>{if(currentRoot)await shell.openPath(currentRoot);});
register('openExternal',async url=>{if(!['https://github.com/lsmedia2105/SogiT-mose-Ai','https://muse.ai/','https://ffmpeg.org/download.html','https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases'].includes(url))throw new Error('Liên kết không được hỗ trợ.');await shell.openExternal(url);});
if(useBuiltUI)await window.loadFile(path.join(here,'../dist/index.html'));else await window.loadURL('http://localhost:5173');
window.on('close',event=>{if(job||museRun){const result=dialog.showMessageBoxSync(window,{type:'warning',message:'Đang có tác vụ. Thoát sẽ dừng Studio; yêu cầu đã gửi lên Muse có thể vẫn chạy.',buttons:['Tiếp tục làm việc','Dừng chờ và thoát'],defaultId:0,cancelId:0});if(result===0){event.preventDefault();return;}job?.controller.abort();museRun?.controller.abort();}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{job?.controller.abort();museRun?.controller.abort();});
}).catch(error=>{console.error('Không thể khởi động Studio:',error.message);app.quit();});
