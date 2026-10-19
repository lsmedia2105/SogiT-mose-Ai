import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../electron/media.mjs';
import { createScene } from '../shared/domain.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-muse-test-'));
const png=path.join(temp,'ref.png'),mp4=path.join(temp,'clip.mp4');
await runProcess('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=256x144:d=1','-frames:v','1','-threads','1',png]);
await runProcess('ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=256x144:d=1:r=24','-c:v','libx264','-pix_fmt','yuv420p','-an',mp4]);
const fixture=await fs.readFile('tests/fixtures/muse.html','utf8');
const image=(await fs.readFile(png)).toString('base64'),video=(await fs.readFile(mp4)).toString('base64');
const app=await electron.launch({args:['--no-sandbox','--disable-gpu',`--user-data-dir=${path.join(temp,'userdata')}`,'.','--studio-built-ui'],timeout:20000});
try{
 const page=await app.firstWindow();await page.waitForSelector('h1');
 await page.evaluate(()=>{window.museEvents=[];window.studio.onMuse(e=>window.museEvents.push(e));});
 await app.evaluate(({dialog},temp)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[temp]});},temp);
 const created=await page.evaluate(()=>window.studio.createProject('Muse integration fixture'));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},png);
 const [refAsset]=await page.evaluate(()=>window.studio.importAssets());
 const project=created.project;project.assets=[refAsset];project.story='A journey to the sea.';
 project.references=[{id:'ref-linh',name:'Linh',kind:'Nhân vật',description:'Blue coat',assetId:refAsset.id,locked:false}];
 project.scenes=[createScene(0,{description:'Linh walks to the sea.',referenceIds:['ref-linh']}),createScene(1,{description:'The lighthouse.'})];
 await page.evaluate(p=>window.studio.saveProject(p),project);
 const [account]=await page.evaluate(()=>window.studio.addAccount('Muse fixture'));
 await app.evaluate(({session},data)=>{
  session.fromPartition(`persist:muse-${data.id}`).protocol.handle('https',request=>{
   const url=new URL(request.url);
   if(url.pathname.startsWith('/fixture/image.png'))return new Response(Buffer.from(data.image,'base64'),{headers:{'Content-Type':'image/png'}});
   if(url.pathname.startsWith('/fixture/video.mp4'))return new Response(Buffer.from(data.video,'base64'),{headers:{'Content-Type':'video/mp4'}});
   return new Response(data.fixture,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  });
 },{id:account.id,image,video,fixture});
 const probe=await page.evaluate(id=>window.studio.museCheck(id),account.id);assert.equal(probe.composer,true);assert.equal(probe.send,true);assert.equal(probe.fileInputs,1);
 const musePage=(await app.windows()).find(p=>p.url().startsWith('https://muse.ai/'));assert.ok(musePage);
 const wait=async id=>{await page.waitForFunction(id=>window.museEvents.some(e=>e.id===id&&['done','error','cancelled'].includes(e.status)),id,{timeout:35000});return page.evaluate(id=>window.museEvents.filter(e=>e.id===id).at(-1),id);};
 // An existing draft must not be overwritten or submitted.
 await musePage.locator('textarea').fill('Do not overwrite this draft');
 let task=await page.evaluate(({p,a})=>window.studio.museStart(p,{kind:'image',sceneIds:[p.scenes[0].id],accountId:a}),{p:project,a:account.id});
 assert.equal((await wait(task.id)).status,'error');assert.equal(await musePage.evaluate(()=>window.fixture.submissions.length),0);assert.equal(await musePage.locator('textarea').inputValue(),'Do not overwrite this draft');
 await musePage.locator('textarea').fill('');
 task=await page.evaluate(({p,a})=>window.studio.museStart(p,{kind:'image',sceneIds:[p.scenes[0].id],accountId:a}),{p:project,a:account.id});
 assert.equal((await wait(task.id)).status,'done');
 let saved=JSON.parse(await fs.readFile(path.join(created.root,'project.sogit.json'),'utf8'));
 assert.equal(saved.scenes[0].imageVersions.length,1);assert.ok(saved.scenes[0].selectedImageAssetId);assert.equal(saved.assets.length,2);
 assert.equal(await musePage.evaluate(()=>window.fixture.submissions[0].files.length),1);
 assert.ok((await fs.stat(path.join(created.root,saved.assets[1].path))).size>100);
 // An autosave captured before the generation completed must preserve its result.
 await page.evaluate(p=>window.studio.saveProject(p),project);
 saved=JSON.parse(await fs.readFile(path.join(created.root,'project.sogit.json'),'utf8'));assert.equal(saved.scenes[0].imageVersions.length,1);
 task=await page.evaluate(({p,a})=>window.studio.museStart(p,{kind:'video',sceneIds:[p.scenes[0].id],accountId:a}),{p:saved,a:account.id});
 assert.equal((await wait(task.id)).status,'done');assert.equal(await musePage.evaluate(()=>window.fixture.submissions[1].files.length),2);
 saved=JSON.parse(await fs.readFile(path.join(created.root,'project.sogit.json'),'utf8'));assert.equal(saved.scenes[0].versions.length,1);assert.equal(saved.assets.at(-1).type,'video');
 task=await page.evaluate(({p,a})=>window.studio.museStart(p,{kind:'script',accountId:a}),{p:saved,a:account.id});
 assert.equal((await wait(task.id)).status,'done');assert.ok((await page.evaluate(()=>window.studio.museHistory())).some(t=>t.resultText?.includes('SHOT 2')));
 // After a submitted job is cancelled, no second shot is sent.
 await musePage.evaluate(()=>window.fixture.hold=true);
 const before=await musePage.evaluate(()=>window.fixture.submissions.length);
 task=await page.evaluate(({p,a})=>window.studio.museStart(p,{kind:'image',sceneIds:p.scenes.map(s=>s.id),accountId:a}),{p:saved,a:account.id});
 await page.waitForFunction(id=>window.museEvents.some(e=>e.id===id&&e.items?.some(i=>i.status==='sent')),task.id,{timeout:15000});
 await page.evaluate(()=>window.studio.cancelJob());assert.equal((await wait(task.id)).status,'cancelled');
 const history=await page.evaluate(()=>window.studio.museHistory());assert.equal(history.at(-2).status,'uncertain');assert.equal(history.at(-1).status,'paused');assert.equal(await musePage.evaluate(()=>window.fixture.submissions.length),before+1);
 console.log('PASS: native Muse browser automation fixture — draft protection, trusted send, file attachment, new assistant image capture/download, stale autosave merge, video with two references, script result, sequential queue cancellation without retry. Live Muse login/generation remains unverified.');
}finally{await app.close();await fs.rm(temp,{recursive:true,force:true});}
