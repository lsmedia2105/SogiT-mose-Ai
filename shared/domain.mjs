export const uid = () => globalThis.crypto.randomUUID();
export const now = () => new Date().toISOString();
export function createScene(index = 0, changes = {}) {
  return { id: uid(), title: `Cảnh ${index + 1}`, description: '', prompt: '', duration: 8,
    shot: 'Trung cảnh', camera: 'Máy tĩnh', emotion: '', dialogue: '', narration: '',
    referenceIds: [], accountId: '', status: 'draft', versions: [], selectedVersionId: '',
    narrationAssetId: '', dialogueAssetId: '', ...changes };
}
export function createProject(name = 'Bộ phim chưa đặt tên') {
  const timestamp = now();
  return { schemaVersion: 1, id: uid(), name: name.trim() || 'Bộ phim chưa đặt tên',
    createdAt: timestamp, updatedAt: timestamp, genre: 'Điện ảnh', ratio: '16:9', fps: 24,
    style: 'Cinematic realism, natural lighting, subtle film grain, cohesive color grading',
    story: '', bible: '', narratorVoice: 'alloy', references: [], scenes: [], assets: [],
    musicAssetId: '', musicVolume: 0.15, logs: [] };
}
export function splitScript(text) {
  const normalized = text.trim().replace(/\r\n/g, '\n');
  if (!normalized) return [];
  const marked = normalized.split(/(?=^(?:#{1,3}\s*)?(?:CẢNH|SCENE)\s+\d+\b)/gim).filter(s => s.trim());
  const hasHeadings = /^(?:#{1,3}\s*)?(?:CẢNH|SCENE)\s+\d+\b/im.test(normalized);
  const blocks = hasHeadings ? marked : normalized.split(/\n\s*\n/).filter(s => s.trim());
  return blocks.map((block, index) => {
    const lines = block.trim().split('\n');
    const heading = /^(?:#{1,3}\s*)?(?:CẢNH|SCENE)\s+\d+/i.test(lines[0]);
    const title=heading ? lines.shift().replace(/^#+\s*/, '').slice(0,160) : `Cảnh ${index+1}`;
    const content=[],narration=[],dialogue=[];
    let duration=8;
    for(const line of lines){
      const voice=line.match(/^\s*(?:LỜI DẪN|VOICE[ -]?OVER|NARRATION)\s*:\s*(.*)$/i);
      const speech=line.match(/^\s*(?:HỘI THOẠI|LỜI THOẠI|DIALOGUE)\s*:\s*(.*)$/i);
      const seconds=line.match(/^\s*(?:THỜI LƯỢNG|DURATION)\s*:\s*(\d+)\s*(?:s|giây|seconds)?\s*$/i);
      if(voice)narration.push(voice[1]);
      else if(speech)dialogue.push(speech[1]);
      else if(seconds)duration=Math.max(1,Math.min(600,Number(seconds[1])));
      else content.push(line);
    }
    return createScene(index,{title,description:content.join('\n').trim(),narration:narration.join('\n'),dialogue:dialogue.join('\n'),duration});
  });
}
export function buildPrompt(project, scene) {
  const refs = project.references.filter(ref => scene.referenceIds.includes(ref.id));
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
    if (!Number.isFinite(s.duration) || s.duration < 1 || s.duration > 600 || !Array.isArray(s.referenceIds) || !Array.isArray(s.versions)) throw new Error('Phân cảnh không hợp lệ.');
  }
  if (!['16:9','9:16','1:1','2.39:1'].includes(p.ratio) || ![24,25,30].includes(p.fps)) throw new Error('Tỷ lệ hoặc FPS không hợp lệ.');
  return p;
}
