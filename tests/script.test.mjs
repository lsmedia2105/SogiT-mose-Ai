import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, createProject, createScene, buildImagePrompt } from '../shared/domain.mjs';
import { applyGeneratedResults } from '../shared/generation.mjs';
import { runQueue, taskRecord, interruptedHistory } from '../electron/muse-queue.mjs';
import { sniffMedia } from '../electron/muse.mjs';

test('MASTER VISUAL LOCK and range headings do not become empty scene cards',()=>{
  const parsed=parseScript('MASTER VISUAL LOCK\nGothic medieval. Same costumes.\n\nCẢNH 001–015 | 00:00–02:00\nSHOT 001 | 00:00–00:08\nVaris walks.\nSHOT 002 | 00:08–00:14\nCamera: Tracking\nIMAGE PROMPT: Close-up of Varis.\nMô tả: Varis looks back.');
  assert.equal(parsed.scenes.length,2);assert.equal(parsed.detected,'shots');assert.match(parsed.globalNotes,/Gothic/);assert.equal(parsed.scenes[0].duration,8);assert.equal(parsed.scenes[1].duration,6);assert.equal(parsed.scenes[1].camera,'Tracking');assert.match(parsed.scenes[1].imagePrompt,/Close-up/);assert.match(parsed.scenes[0].parentScene,/001–015/);
});
test('recognizes Markdown shot titles, scene context and skips empty headings',()=>{
  const p=parseScript('## SCENE 1 — Harbor\nNight.\n### SHOT 1 — Wide\nBoats return.\n### SHOT 2 — Empty\n## SCENE 2 — House\n### SHOT 3\nA door opens.');
  assert.equal(p.scenes.length,2);assert.match(p.scenes[0].description,/Night/);assert.match(p.scenes[1].parentScene,/House/);assert.ok(p.warnings.some(s=>s.includes('không có nội dung')));
});
test('long scenes split by duration only when requested, without repeating full dialogue',()=>{
  const source='CẢNH 1 — Biển\nLinh opens the door. She sees the sea. She smiles.\nTHỜI LƯỢNG: 20\nLỜI DẪN: A long time ago.\nHỘI THOẠI: Linh: Hello.';
  assert.equal(parseScript(source).scenes.length,1);
  const p=parseScript(source,{autoSplit:true,maxShotDuration:8});assert.deepEqual(p.scenes.map(s=>s.duration),[8,8,4]);assert.equal(p.scenes.filter(s=>s.dialogue).length,1);assert.equal(new Set(p.scenes.map(s=>s.id)).size,3);assert.match(p.warnings.join(' '),/theo thời lượng/);
});
test('image prompt explicitly requests a generated image and includes selected reference only',()=>{
  const p=createProject();p.references=[{id:'r',name:'Linh',kind:'Nhân vật',description:'Blue jacket'},{id:'other',name:'Unselected'}];
  const prompt=buildImagePrompt(p,createScene(0,{referenceIds:['r'],imagePrompt:'A blue-lit harbor.'}));assert.match(prompt,/finished cinematic storyboard IMAGE/);assert.match(prompt,/Blue jacket/);assert.match(prompt,/blue-lit/);assert.doesNotMatch(prompt,/Unselected/);
});
test('late autosave cannot erase generation results or override an explicit selected version',()=>{
  const p=createProject();p.scenes=[createScene(0,{selectedImageAssetId:'approved'})];const id=p.scenes[0].id;
  const entry={targetType:'scene',targetId:id,asset:{id:'generated',type:'image',path:'assets/a.png'}};
  const once=applyGeneratedResults(p,[entry]);const twice=applyGeneratedResults(once,[entry]);assert.equal(twice.assets.length,1);assert.deepEqual(twice.scenes[0].imageVersions,['generated']);assert.equal(twice.scenes[0].selectedImageAssetId,'approved');assert.equal(p.assets.length,0);
});
test('queue sends sequentially and stops after uncertain submission without retries',async()=>{
  const tasks=[taskRecord({title:'One'}),taskRecord({title:'Two'})];let calls=0,persists=0;
  const result=await runQueue({tasks,signal:new AbortController().signal,persist:async()=>persists++,onUpdate:()=>{},perform:async(_,state)=>{calls++;await state('sending');await state('sent');throw new Error('network failed');}});
  assert.equal(calls,1);assert.equal(tasks[0].status,'uncertain');assert.equal(tasks[1].status,'paused');assert.equal(result.status,'error');assert.ok(persists>=3);
});
test('cancellation after send is uncertain and restart never silently resumes it',async()=>{
  const controller=new AbortController(),tasks=[taskRecord({title:'One'}),taskRecord({title:'Two'})];
  await runQueue({tasks,signal:controller.signal,persist:async()=>{},onUpdate:()=>{},perform:async(_,state)=>{await state('sent');controller.abort();controller.signal.throwIfAborted();}});
  assert.equal(tasks[0].status,'uncertain');assert.equal(tasks[1].status,'paused');
  assert.equal(interruptedHistory([{status:'sent'}])[0].status,'interrupted');assert.equal(interruptedHistory([{status:'done'}])[0].status,'done');
});
test('rejects HTML and image poster data as video download results',()=>{
  assert.throws(()=>sniffMedia(Buffer.from('<html>login</html>'),'image'));
  assert.throws(()=>sniffMedia(Buffer.from([137,80,78,71,13,10,26,10]),'video'));
  assert.equal(sniffMedia(Buffer.from('0000ftypisom'),'video'),'.mp4');
});
