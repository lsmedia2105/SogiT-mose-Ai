export type Asset = { id:string; name:string; path:string; type:'image'|'video'|'audio'; createdAt:string; url?:string };
export type Reference = { id:string; name:string; kind:string; description:string; assetId:string; locked:boolean; imageAssetIds?:string[] };
export type Scene = { id:string; title:string; description:string; prompt:string; duration:number; shot:string; camera:string; emotion:string; dialogue:string; narration:string; referenceIds:string[]; accountId:string; status:string; versions:{id:string;assetId:string;createdAt:string}[]; selectedVersionId:string; narrationAssetId:string; dialogueAssetId:string; imageVersions?:string[]; selectedImageAssetId?:string; imagePrompt?:string; parentScene?:string };
export type Project = { schemaVersion:number; id:string; name:string; createdAt:string; updatedAt:string; genre:string; ratio:string; fps:number; style:string; story:string; bible:string; narratorVoice:string; references:Reference[]; scenes:Scene[]; assets:Asset[]; musicAssetId:string; musicVolume:number; logs:unknown[] };
export type Account = { id:string; name:string; createdAt:string };
export type Settings = { profile:string; ffmpegPath:string; ffprobePath:string; realesrganPath:string; realesrganModelDir:string; baseUrl:string; textModel:string; hasApiKey:boolean; apiKey?:string; clearApiKey?:boolean; museComposer?:string; museSend?:string; museResult?:string; museFile?:string; museTimeout?:number };
export type Bootstrap = { desktop:boolean; settings:Settings; accounts:Account[]; recent:{name:string;path:string}[]; hardware:{memoryGB:number;cpus:number;platform:string;gpus:string[]}; tools:{ffmpeg:string|null;ffprobe:string|null} };
export type Job = { id:string; kind?:string; status?:string; stage?:string; percent?:number; output?:string; log?:string };
export type MuseTask = {id:string;title:string;kind:string;status:string;error?:string;createdAt:string;submittedAt?:string;targetId?:string;targetType?:string;assetId?:string;resultText?:string};
export type GenerationEntry = {targetType:string;targetId:string;asset:Asset};
export type MuseEvent = Job & {projectId:string;items?:MuseTask[];entries?:GenerationEntry[];script?:string};
export type MuseOptions = {kind:'image'|'video'|'reference'|'script';accountId?:string;sceneIds?:string[];referenceId?:string;maxShotDuration?:number};
export interface StudioAPI {
  bootstrap():Promise<Bootstrap>;
  createProject(name:string):Promise<{project:Project;root:string}|null>;
  openProject():Promise<{project:Project;root:string}|null>;
  saveProject(p:Project):Promise<boolean>;
  importAssets():Promise<Asset[]>;
  saveSettings(s:Settings):Promise<Settings>;
  pickTool(kind:string):Promise<string|null>;
  openMuse(id:string,prompt?:string):Promise<boolean>;
  museCheck(id:string):Promise<{composer:boolean;composerCount:number;draft:boolean;send:boolean;fileInputs:number;assistantContainers:number}>;
  museReport(id:string):Promise<boolean>;
  museStart(p:Project,options:MuseOptions):Promise<{id:string}>;
  museHistory():Promise<MuseTask[]>;
  onMuse(callback:(event:MuseEvent)=>void):()=>void;
  addAccount(name:string):Promise<Account[]>;
  removeAccount(id:string):Promise<Account[]>;
  generateText(args:{task:string;project:Project;sceneId?:string}):Promise<string>;
  exportPrompts(p:Project):Promise<boolean>;
  exportSrt(p:Project):Promise<boolean>;
  startRender(p:Project,options:{resolution:string}):Promise<{id:string}|null>;
  startUpscale(p:Project,options:{resolution:string;assetId:string;engine:string}):Promise<{id:string}|null>;
  cancelJob():Promise<boolean>;
  showProject():Promise<void>;
  openExternal(url:string):Promise<void>;
  onJob(callback:(job:Job)=>void):()=>void;
}
declare global { interface Window { studio?:StudioAPI; } }
