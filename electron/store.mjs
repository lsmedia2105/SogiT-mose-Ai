import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateProject } from '../shared/domain.mjs';
import { normalizeProject } from '../shared/structure.mjs';

export async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}
export function safeChild(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Đường dẫn không hợp lệ.');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Đường dẫn nằm ngoài thư mục dự án.');
  return resolved;
}
export async function realChild(root, relative) {
  const candidate = safeChild(root, relative);
  const [base, real] = await Promise.all([fs.realpath(root), fs.realpath(candidate)]);
  if (!real.startsWith(base + path.sep)) throw new Error('Không hỗ trợ liên kết ra ngoài dự án.');
  return real;
}
export async function saveProject(root, project) {
  validateProject(project);
  for (const asset of project.assets) safeChild(root, asset.path);
  await atomicJSON(path.join(root, 'project.sogit.json'), normalizeProject(project));
}
export async function loadProject(root) {
  const stat = await fs.stat(path.join(root, 'project.sogit.json'));
  if (stat.size > 30 * 1024 * 1024) throw new Error('File dự án quá lớn.');
  const source=await fs.readFile(path.join(root,'project.sogit.json'),'utf8');
  const project = validateProject(JSON.parse(source));
  for (const asset of project.assets) safeChild(root, asset.path);
  if(project.structureVersion!==2){
    await fs.mkdir(path.join(root,'.sogit'),{recursive:true});
    const dir=await realChild(root,'.sogit');
    try{await fs.writeFile(path.join(dir,'project-before-v0.3.json'),source,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  return normalizeProject(project);
}
export async function importAsset(root, source) {
  const ext = path.extname(source).toLowerCase();
  const allowed = ['.png','.jpg','.jpeg','.webp','.mp4','.mov','.mkv','.webm','.wav','.mp3','.m4a','.ogg'];
  if (!allowed.includes(ext)) throw new Error('Định dạng media chưa được hỗ trợ.');
  const id = randomUUID();
  const relative = `assets/${id}${ext}`;
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  const [realRoot, realAssets] = await Promise.all([fs.realpath(root), fs.realpath(path.join(root,'assets'))]);
  if (!realAssets.startsWith(realRoot + path.sep)) throw new Error('Thư mục assets liên kết ra ngoài dự án.');
  await fs.copyFile(source, safeChild(root, relative));
  return { id, name: path.basename(source), path: relative, type: ['.png','.jpg','.jpeg','.webp'].includes(ext) ? 'image' : ['.mp4','.mov','.mkv','.webm'].includes(ext) ? 'video' : 'audio', createdAt: new Date().toISOString() };
}
