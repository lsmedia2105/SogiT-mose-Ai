import { effectiveReferenceIds } from './structure.mjs';
export const uid = () => globalThis.crypto.randomUUID();
export const now = () => new Date().toISOString();
export function createScene(index = 0, changes = {}) {
  return { id: uid(), title: `Cảnh ${index + 1}`, description: '', prompt: '', duration: 8,
    shot: 'Trung cảnh', camera: 'Máy tĩnh', emotion: '', dialogue: '', narration: '',
    referenceIds: [], accountId: '', status: 'draft', versions: [], selectedVersionId: '',
    narrationAssetId: '', dialogueAssetId: '', imageVersions: [], selectedImageAssetId: '', imagePrompt: '', parentScene: '', ...changes };
}
export function createProject(name = 'Bộ phim chưa đặt tên') {
  const timestamp = now();
  return { schemaVersion: 1, id: uid(), name: name.trim() || 'Bộ phim chưa đặt tên',
    createdAt: timestamp, updatedAt: timestamp, genre: 'Điện ảnh', ratio: '16:9', fps: 24,
    style: 'Cinematic realism, natural lighting, subtle film grain, cohesive color grading',
    structureVersion: 2, sceneGroups: [], story: '', bible: '', narratorVoice: 'alloy', references: [], scenes: [], assets: [],
    musicAssetId: '', musicVolume: 0.15, logs: [] };
}
export { splitScript, parseScript, buildImagePrompt, buildShotlistPrompt } from './script.mjs';
export function buildPrompt(project, scene) {
  const refs = project.references.filter(ref => effectiveReferenceIds(project,scene).includes(ref.id));
  return [
    `CINEMATIC SHOT | ${project.ratio} | ${scene.duration}s | ${project.fps} fps`,
    `VISUAL STYLE: ${project.style}`,
    project.bible && `STORY WORLD & CONTINUITY: ${project.bible}`,
    ...refs.map(ref => `REFERENCE [${ref.kind}] ${ref.name}: ${ref.description || 'Use the approved reference image.'}`),
    `SCENE: ${scene.description || scene.title}`,
    `FRAMING: ${scene.shot}. CAMERA: ${scene.camera}.`,
    scene.emotion && `PERFORMANCE & MOOD: ${scene.emotion}`,
    scene.dialogue && `DIALOGUE (preserve exact wording): ${scene.dialogue}`,
    scene.narration && `VOICE-OVER, OFF SCREEN: ${scene.narration}`,
    'CONTINUITY: Preserve the identities, costumes, props and setting of the attached approved references. Keep screen direction and lighting coherent.',
    'Avoid unrequested text, logos, face morphing, extra limbs and abrupt camera jumps.',
    'Attach the selected reference images to the generation request. A text prompt alone cannot guarantee identity consistency.',
  ].filter(Boolean).join('\n\n');
}
export const PROFILES = {
  eco: { name: 'Tiết kiệm', localConcurrency: 1, description: '2 luồng FFmpeg, preset nhanh, tạo nội dung qua cloud.' },
  balanced: { name: 'Cân bằng', localConcurrency: 1, description: '4 luồng FFmpeg. Cloud tạo nội dung, máy dựng và xuất.' },
  quality: { name: 'Chất lượng', localConcurrency: 1, description: '4 luồng FFmpeg. GPU AI local cần thiết lập riêng.' },
};
export function recommendProfile(memoryGB) { return memoryGB < 12 ? 'eco' : memoryGB < 24 ? 'balanced' : 'quality'; }
export function validateProject(p) {
  if (!p || p.schemaVersion !== 1 || typeof p.id !== 'string' || !/^[\w-]{1,100}$/.test(p.id) ||
      typeof p.name !== 'string' || !Array.isArray(p.scenes) || !Array.isArray(p.references) || !Array.isArray(p.assets)) {
    throw new Error('Dự án không hợp lệ hoặc phiên bản chưa được hỗ trợ.');
  }
  if (p.scenes.length > 1000 || p.assets.length > 20000 || p.references.length > 2000) throw new Error('Dự án vượt giới hạn an toàn.');
  const ids = new Set();
  for (const item of [...p.scenes, ...p.references, ...p.assets]) {
    if (!item || typeof item.id !== 'string' || !/^[\w-]{1,100}$/.test(item.id) || ids.has(item.id)) throw new Error('Mã dữ liệu dự án không hợp lệ hoặc trùng.');
    ids.add(item.id);
  }
  for (const s of p.scenes) {
    if (!Number.isFinite(s.duration) || s.duration < 0.1 || s.duration > 600 || !Array.isArray(s.referenceIds) || !Array.isArray(s.versions)) throw new Error('Phân cảnh không hợp lệ.');
  }
  if(p.sceneGroups!==undefined){
    if(!Array.isArray(p.sceneGroups))throw new Error('Danh sách cảnh không hợp lệ.');
    const groupIds=new Set();
    for(const group of p.sceneGroups){if(!group||typeof group.id!=='string'||!/^[\w-]{1,100}$/.test(group.id)||groupIds.has(group.id)||typeof group.title!=='string'||!Array.isArray(group.referenceIds))throw new Error('Cấu trúc cảnh không hợp lệ.');groupIds.add(group.id);}
    for(const shot of p.scenes)if(shot.groupId&&!groupIds.has(shot.groupId))throw new Error('Shot trỏ đến cảnh không tồn tại.');
  }
  if (!['16:9','9:16','1:1','2.39:1'].includes(p.ratio) || ![24,25,30].includes(p.fps)) throw new Error('Tỷ lệ hoặc FPS không hợp lệ.');
  return p;
}
