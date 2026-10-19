import { normalizeProject, shotLabels, orderedShots, displayTitle } from '../shared/structure.mjs';
import { createProject, validateProject } from '../shared/domain.mjs';
import type { StudioAPI, Project, Scene, Asset, Account, Settings } from './types';

// Browser mode is a local preview, with IndexedDB persistence. Native operations stay explicit.
const dbPromise = typeof indexedDB === 'undefined' ? null : new Promise<IDBDatabase>((resolve,reject)=>{
  const req=indexedDB.open('sogit-studio',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('projects',{keyPath:'id'});req.result.createObjectStore('media');req.result.createObjectStore('settings');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function dbGet(store:string,key:IDBValidKey):Promise<any>{const db=await dbPromise!;return new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function dbPut(store:string,value:unknown,key?:IDBValidKey){const db=await dbPromise!;return new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
let current:Project|null=null;
const urls=new Map<string,string>();
const defaults:Settings={profile:'eco',ffmpegPath:'',ffprobePath:'',realesrganPath:'',realesrganModelDir:'',baseUrl:'https://api.openai.com/v1',textModel:'',hasApiKey:false};
const nativeOnly=async():Promise<never>=>{throw new Error('Chức năng này cần ứng dụng desktop Windows. Bản trình duyệt chỉ dùng quản lý và xem trước.');};
function pickFiles(accept:string,multiple=false):Promise<File[]>{return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.onchange=()=>resolve(Array.from(input.files||[]));input.addEventListener('cancel',()=>resolve([]));input.click();});}
async function hydrate(p:Project){p=normalizeProject(p) as Project;for(const a of p.assets){if(urls.has(a.id))a.url=urls.get(a.id);else{const blob=await dbGet('media',a.id);if(blob){a.url=URL.createObjectURL(blob);urls.set(a.id,a.url);}}}return p;}
async function save(p:Project){const value=normalizeProject(p);for(const a of value.assets)delete a.url;await dbPut('projects',value);current=p;await dbPut('settings',p.id,'lastProject');return true;}
function download(name:string,text:string,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;}
const browser:StudioAPI={
  async bootstrap(){return {desktop:false,settings:{...defaults,...await dbGet('settings','config')},accounts:await dbGet('settings','accounts')||[],recent:[],hardware:{memoryGB:0,cpus:navigator.hardwareConcurrency||2,platform:'browser',gpus:[]},tools:{ffmpeg:null,ffprobe:null}};},
  async createProject(name){const p=createProject(name) as Project;await save(p);return {project:p,root:'IndexedDB • Bộ nhớ trình duyệt'};},
  async openProject(){
    const last=await dbGet('settings','lastProject');
    if(last){const p=await dbGet('projects',last);if(p){if(p.structureVersion!==2)await dbPut('settings',p,`legacy-backup-${p.id}`);current=await hydrate(p);return {project:current,root:'IndexedDB • Bộ nhớ trình duyệt'};}}
    const [file]=await pickFiles('.json');if(!file)return null;
    const p=validateProject(JSON.parse(await file.text())) as Project;await save(p);return {project:await hydrate(p),root:'IndexedDB • Bộ nhớ trình duyệt'};
  },
  saveProject:save,
  async importAssets(){if(!current)throw new Error('Chưa có dự án.');const files=await pickFiles('image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/*',true);const assets:Asset[]=[];for(const f of files){if(f.size>250*1024*1024)throw new Error('Bản xem trước giới hạn mỗi file 250 MB. Dùng desktop cho video lớn.');const id=crypto.randomUUID();await dbPut('media',f,id);const url=URL.createObjectURL(f);urls.set(id,url);assets.push({id,name:f.name,path:`assets/${id}`,type:f.type.startsWith('image/')?'image':f.type.startsWith('video/')?'video':'audio',createdAt:new Date().toISOString(),url});}return assets;},
  async saveSettings(s){if(s.apiKey)throw new Error('Chỉ lưu API key trong kho mã hóa của bản desktop.');const {apiKey,clearApiKey,...clean}=s;await dbPut('settings',clean,'config');return clean;},
  pickTool:nativeOnly,openMuse:nativeOnly,museCheck:nativeOnly,museReport:nativeOnly,museStart:nativeOnly,museHistory:async()=>[],onMuse:()=>()=>{},
  async addAccount(name){const accounts:Account[]=await dbGet('settings','accounts')||[];accounts.push({id:crypto.randomUUID(),name,createdAt:new Date().toISOString()});await dbPut('settings',accounts,'accounts');return accounts;},
  async removeAccount(id){const accounts:Account[]=(await dbGet('settings','accounts')||[]).filter((a:Account)=>a.id!==id);await dbPut('settings',accounts,'accounts');return accounts;},
  generateText:nativeOnly,
  async exportPrompts(p){return download('prompts.txt',orderedShots(p).map((s:Scene)=>`${shotLabels(p)[s.id].code} — ${displayTitle(s.title,'shot')}\n${s.prompt||s.description}`).join('\n\n---\n\n'));},
  async exportSrt(p){const {toSrt}=await import('../shared/subtitles.mjs');return download('subtitles.srt',toSrt(p));},
  async exportShotMedia(p,shotId,assetId){const asset=p.assets.find(a=>a.id===assetId);if(!asset?.url)throw new Error('Không tìm thấy media.');const anchor=document.createElement('a');anchor.href=asset.url;anchor.download=`${shotLabels(p)[shotId]?.code||'shot'}-${asset.type}.${(asset.path.match(/\.(png|jpe?g|webp|mp4|webm|mov|mkv)$/i)||asset.name.match(/\.(png|jpe?g|webp|mp4|webm|mov|mkv)$/i))?.[1]||(asset.type==='video'?'mp4':'png')}`;anchor.click();return true;},
  exportAllShotMedia:nativeOnly,
  startRender:nativeOnly,startUpscale:nativeOnly,cancelJob:async()=>true,showProject:nativeOnly,
  async openExternal(url){window.open(url,'_blank','noopener,noreferrer');},onJob:()=>()=>{},
};
export const api:StudioAPI=window.studio||browser;
export function exportMetadata(p:Project){const clean=structuredClone(p);for(const a of clean.assets)delete a.url;download('project.sogit.json',JSON.stringify(clean,null,2),'application/json');}
