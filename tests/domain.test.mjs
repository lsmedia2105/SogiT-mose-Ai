import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createScene, splitScript, buildPrompt, validateProject, recommendProfile } from '../shared/domain.mjs';
import { toSrt } from '../shared/subtitles.mjs';

test('splits Vietnamese and English scene headings, preserving multiline action',()=>{
  const scenes=splitScript('CẢNH 1 — Bình minh\nLinh bước vào.\nCô mở cửa.\n\nSCENE 2 — Night\nThe lantern is lit.');
  assert.equal(scenes.length,2);assert.equal(scenes[0].title,'CẢNH 1 — Bình minh');
  assert.equal(scenes[0].description,'Linh bước vào.\nCô mở cửa.');assert.match(scenes[1].description,/lantern/);
  assert.equal(new Set(scenes.map(s=>s.id)).size,2);
});
test('blank scripts create no scenes; paragraphs provide a non-AI fallback',()=>{
  assert.deepEqual(splitScript('  '),[]);assert.equal(splitScript('Đoạn một\n\nĐoạn hai').length,2);
});
test('extracts narration, dialogue and duration; one scene heading retains blank lines',()=>{
  const scenes=splitScript('CẢNH 1 — Biển\nBình minh.\n\nLỜI DẪN: Mùa hè năm ấy.\nHỘI THOẠI: Linh: Cha ơi!\nTHỜI LƯỢNG: 12 giây');
  assert.equal(scenes.length,1);assert.equal(scenes[0].narration,'Mùa hè năm ấy.');assert.equal(scenes[0].dialogue,'Linh: Cha ơi!');assert.equal(scenes[0].duration,12);assert.equal(scenes[0].description,'Bình minh.');
});
test('production prompts include only selected references, bible and exact dialogue',()=>{
  const p=createProject('Phim');p.bible='Năm 1998';p.references=[{id:'a',kind:'Nhân vật',name:'Linh',description:'áo xanh'},{id:'b',kind:'Nhân vật',name:'Unselected',description:'should not leak'}];
  const s=createScene(0,{referenceIds:['a'],dialogue:'Cha đã về sao?',narration:'Mùa hè năm ấy…'});
  const prompt=buildPrompt(p,s);assert.match(prompt,/Năm 1998/);assert.match(prompt,/áo xanh/);assert.match(prompt,/Cha đã về sao\?/);assert.doesNotMatch(prompt,/Unselected/);assert.match(prompt,/cannot guarantee/);
});
test('rejects malformed projects before persistence',()=>{
  const p=createProject();p.scenes=[createScene()];assert.equal(validateProject(p),p);
  assert.throws(()=>validateProject({...p,id:'../outside'}));
  assert.throws(()=>validateProject({...p,scenes:[{...p.scenes[0],duration:-5}]}));
  assert.throws(()=>validateProject({...p,scenes:[p.scenes[0],p.scenes[0]]}));
  assert.throws(()=>validateProject({...p,fps:Infinity}));
});
test('SRT follows timeline offsets, skips silent scenes without losing time',()=>{
  const p=createProject();p.scenes=[createScene(0,{duration:3}),createScene(1,{duration:2,narration:'Bình minh.',dialogue:'Linh: Chào cha.'})];
  assert.equal(toSrt(p),'1\n00:00:03,000 --> 00:00:05,000\nBình minh.\nLinh: Chào cha.\n');
});
test('hardware profiles keep low-memory machines in cloud-oriented mode',()=>{assert.equal(recommendProfile(8),'eco');assert.equal(recommendProfile(16),'balanced');assert.equal(recommendProfile(32),'quality');});
