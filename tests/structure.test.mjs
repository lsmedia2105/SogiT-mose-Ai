import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, createScene, parseScript, buildPrompt } from '../shared/domain.mjs';
import { normalizeProject, shotLabels, effectiveReferenceIds, assignReferences, toggleShotReference, moveShot, orderedShots } from '../shared/structure.mjs';
import { loadProject, saveProject } from '../electron/store.mjs';

test('one eight-second scene contains four time-ranged shots, next scene restarts shot numbering',()=>{
  const parsed=parseScript('MASTER VISUAL LOCK\nCinematic Gothic.\nCẢNH 1 — Truy đuổi\n0–2 giây — ELENA runs.\n2–4 giây — Low-angle chase.\n4–6 giây — ELENA avoids a cart.\n6–8 giây — HUGO appears.\nCẢNH 2 — Cánh cửa\n0–3 giây — A door opens.');
  assert.equal(parsed.sceneGroups.length,2);assert.equal(parsed.scenes.length,5);assert.deepEqual(parsed.scenes.slice(0,4).map(s=>s.duration),[2,2,2,2]);assert.equal(new Set(parsed.scenes.slice(0,4).map(s=>s.groupId)).size,1);
  const p={...createProject(),sceneGroups:parsed.sceneGroups,scenes:parsed.scenes},labels=shotLabels(p);
  assert.equal(labels[p.scenes[0].id].code,'C001-S001');assert.equal(labels[p.scenes[3].id].code,'C001-S004');assert.equal(labels[p.scenes[4].id].code,'C002-S001');assert.equal(labels[p.scenes[3].id].end,8);
});
test('reference names/aliases match whole normalized words; global and scene references inherit and can be excluded',()=>{
  const parsed=parseScript('CẢNH 1\nSHOT 1\nELENA and Húgô walk through the street.\nSHOT 2\nA banana lies on the ground.');
  const p={...createProject(),scenes:parsed.scenes,sceneGroups:parsed.sceneGroups,references:[{id:'e',name:'Elena Voss',aliases:['ELENA'],description:'blue coat'},{id:'h',name:'COMMANDER HUGO',aliases:['Hugo']},{id:'a',name:'Ana'},{id:'s',name:'Style',applyToAll:true},{id:'b',name:'Alley'}]};
  p.sceneGroups[0].referenceIds=['b'];const assigned=assignReferences(p);
  assert.deepEqual(assigned.scenes[0].referenceIds,['e','h']);assert.deepEqual(assigned.scenes[1].referenceIds,[]);
  assert.deepEqual(new Set(effectiveReferenceIds(assigned,assigned.scenes[0])),new Set(['e','h','s','b']));
  const excluded=toggleShotReference(assigned,assigned.scenes[0].id,'s');assert.ok(!effectiveReferenceIds(excluded,excluded.scenes[0]).includes('s'));assert.ok(effectiveReferenceIds(excluded,excluded.scenes[1]).includes('s'));
  assert.match(buildPrompt(assigned,assigned.scenes[0]),/blue coat/);
});
test('reordering renumbers labels and export names while retaining media/reference IDs',()=>{
  const parsed=parseScript('CẢNH 1\nSHOT 1\nOne.\nSHOT 2\nTwo.\nCẢNH 2\nSHOT 1\nThree.');
  const p={...createProject(),scenes:parsed.scenes,sceneGroups:parsed.sceneGroups};p.scenes[0].selectedImageAssetId='keep-image';p.scenes[0].referenceIds=['keep-ref'];const id=p.scenes[0].id;
  const moved=moveShot(p,id,1);assert.equal(shotLabels(moved)[id].filename,'C001-S002');assert.equal(moved.scenes[1].selectedImageAssetId,'keep-image');assert.deepEqual(moved.scenes[1].referenceIds,['keep-ref']);
  moved.sceneGroups.reverse();assert.equal(shotLabels(moved)[id].code,'C002-S002');assert.equal(orderedShots(moved)[0].title,'SHOT 1');assert.equal(orderedShots(moved)[0].description,'Three.');
});
test('legacy projects migrate deterministically without losing selected video or reference',()=>{
  const p=createProject();delete p.sceneGroups;delete p.structureVersion;p.scenes=[createScene(0,{parentScene:'Old scene',referenceIds:['r'],versions:[{id:'v',assetId:'a'}],selectedVersionId:'v'}),createScene(1,{parentScene:'Old scene'})];
  const migrated=normalizeProject(p);assert.equal(migrated.sceneGroups.length,1);assert.equal(migrated.scenes[0].id,p.scenes[0].id);assert.equal(migrated.scenes[0].selectedVersionId,'v');assert.deepEqual(migrated.scenes[0].referenceIds,['r']);assert.deepEqual(normalizeProject(migrated),migrated);assert.equal(p.structureVersion,undefined);
});
test('opening an old disk project preserves the original backup before a migrated save',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-v03-migrate-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const p=createProject('Old project');delete p.sceneGroups;delete p.structureVersion;p.scenes=[createScene()];const raw=JSON.stringify(p);
  await fs.writeFile(path.join(root,'project.sogit.json'),raw);const loaded=await loadProject(root);assert.equal(loaded.structureVersion,2);assert.equal(loaded.scenes[0].id,p.scenes[0].id);
  assert.equal(await fs.readFile(path.join(root,'.sogit/project-before-v0.3.json'),'utf8'),raw);await saveProject(root,loaded);await loadProject(root);assert.equal(await fs.readFile(path.join(root,'.sogit/project-before-v0.3.json'),'utf8'),raw);
});
