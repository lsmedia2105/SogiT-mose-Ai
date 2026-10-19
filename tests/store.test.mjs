import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProject, createScene } from '../shared/domain.mjs';
import { safeChild, realChild, saveProject, loadProject, importAsset } from '../electron/store.mjs';

test('project save, reopen and portable media copies survive source removal',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-store-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'Dự án Việt');await fs.mkdir(root);const source=path.join(dir,'reference.png');await fs.writeFile(source,Buffer.from([1,2,3]));
  const p=createProject('Ánh sáng');p.scenes=[createScene()];p.assets=[await importAsset(root,source)];
  await saveProject(root,p);await fs.rm(source);const reopened=await loadProject(root);
  assert.equal(reopened.name,'Ánh sáng');assert.deepEqual(await fs.readFile(await realChild(root,reopened.assets[0].path)),Buffer.from([1,2,3]));
  reopened.name='Tên mới';await saveProject(root,reopened);assert.equal((await loadProject(root)).name,'Tên mới');
  assert.equal((await fs.readdir(root)).filter(x=>x.endsWith('.tmp')).length,0);
});
test('rejects lexical path traversal and symlink escape',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-path-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project');await fs.mkdir(root);
  assert.throws(()=>safeChild(root,'../other'));assert.throws(()=>safeChild(root,path.resolve('/etc/passwd')));
  const outside=path.join(dir,'secret.txt');await fs.writeFile(outside,'private');await fs.symlink(outside,path.join(root,'link.txt'));
  await assert.rejects(realChild(root,'link.txt'),/ngoài/);
  const p=createProject();p.assets=[{id:'abc',path:'../secret.txt'}];await assert.rejects(saveProject(root,p),/ngoài/);
});
test('does not overwrite a project when validation fails',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-validation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const p=createProject('Original');await saveProject(root,p);await assert.rejects(saveProject(root,{...p,schemaVersion:99}));assert.equal((await loadProject(root)).name,'Original');
});
test('import refuses an assets directory symlink escaping the project',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sogit-import-path-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project'),outside=path.join(dir,'outside');await fs.mkdir(root);await fs.mkdir(outside);await fs.symlink(outside,path.join(root,'assets'),'dir');
  const source=path.join(dir,'source.png');await fs.writeFile(source,'image');
  await assert.rejects(importAsset(root,source),/ngoài/);assert.deepEqual(await fs.readdir(outside),[]);
});
