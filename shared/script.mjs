import { createScene } from './domain.mjs';

const cleanHeading = line => line.trim().replace(/^#{1,6}\s*/, '').replace(/^[-*]\s+/, '').replace(/^\*\*|\*\*$/g, '');
const shotHeading = line => /^(?:SHOT|SHORT|CÚ MÁY|CÚ QUAY|PHÂN CẢNH)\s*#?\s*\d+[a-z]?(?:\.\d+)?\b/i.test(cleanHeading(line));
const sceneHeading = line => /^(?:CẢNH|SCENE)\s*#?\s*\d+\b/i.test(cleanHeading(line));
const metadataHeading = line => /^(?:MASTER\s+(?:VISUAL\s+)?LOCK|VISUAL\s+LOCK|GLOBAL\s+(?:NOTES|STYLE)|GHI CHÚ CHUNG|QUY TẮC CHUNG|PHONG CÁCH CHUNG)\b/i.test(cleanHeading(line));
function headerDuration(heading) {
  const times=heading.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?\b/g);
  if(!times||times.length<2)return null;
  const seconds=t=>t.replace(',','.').split(':').reduce((sum,n)=>sum*60+Number(n),0);
  const duration=seconds(times[1])-seconds(times[0]);
  return duration>0?Math.min(600,duration):null;
}
function bodyFields(lines,heading,index,parent='') {
  const scene=createScene(index,{title:heading.slice(0,160),parentScene:parent});
  const desc=[],voice=[],dialogue=[];let duration=headerDuration(heading);
  for(const line of lines){
    const entry=line.trim().replace(/^[-*]\s+/,'').replace(/\*\*/g,'');
    const field=entry.match(/^([^:]{2,35}):\s*(.*)$/);
    const key=field?.[1]?.toLocaleUpperCase(),value=field?.[2]||'';
    if(['LỜI DẪN','VOICE-OVER','VOICE OVER','NARRATION','VO'].includes(key))voice.push(value);
    else if(['HỘI THOẠI','LỜI THOẠI','DIALOGUE'].includes(key))dialogue.push(value);
    else if(['THỜI LƯỢNG','DURATION'].includes(key)&&/^\d+(?:\.\d+)?\s*(?:s|giây|seconds)?$/i.test(value))duration=Number.parseFloat(value);
    else if(['CỠ CẢNH','SHOT SIZE','FRAMING'].includes(key))scene.shot=value;
    else if(['MÁY QUAY','CAMERA'].includes(key))scene.camera=value;
    else if(['CẢM XÚC','EMOTION'].includes(key))scene.emotion=value;
    else if(['PROMPT ẢNH','IMAGE PROMPT'].includes(key))scene.imagePrompt=value;
    else if(['PROMPT','VIDEO PROMPT'].includes(key))scene.prompt=value;
    else if(!/^\s*(?:---+|```.*)\s*$/.test(line))desc.push(line);
  }
  return {...scene,description:desc.join('\n').trim(),narration:voice.join('\n'),dialogue:dialogue.join('\n'),duration:Math.max(1,Math.min(600,duration||8))};
}

/** Structural parsing, not AI reasoning. Source text remains in the project. */
export function parseScript(text,{autoSplit=false,maxShotDuration=8}={}) {
  const source=String(text||'').replace(/\r\n?/g,'\n').trim();
  const result={scenes:[],globalNotes:'',warnings:[],detected:'paragraphs'};
  if(!source)return result;
  const max=Math.max(2,Math.min(60,Number(maxShotDuration)||8));
  const lines=source.split('\n'),hasShots=lines.some(shotHeading),hasScenes=lines.some(sceneHeading);
  result.detected=hasShots?'shots':hasScenes?'scenes':'paragraphs';
  let records=[],preamble=[],active=null,parent='',parentBody=[];
  if(hasShots||hasScenes){
    for(const line of lines){
      if(hasShots&&sceneHeading(line)){
        if(active){records.push(active);active=null;}
        parent=cleanHeading(line);parentBody=[];
      }else if((hasShots&&shotHeading(line))||(!hasShots&&sceneHeading(line))){
        if(active)records.push(active);
        active={heading:cleanHeading(line),lines:[],context:hasShots?parentBody.join('\n').trim():'',parent:hasShots?parent:''};
      }else if(active)active.lines.push(line);
      else if(parent)parentBody.push(line);
      else preamble.push(line);
    }
    if(active)records.push(active);
    result.globalNotes=preamble.join('\n').trim();
  }else{
    const blocks=source.split(/\n\s*\n/).filter(s=>s.trim());
    for(const block of blocks){
      if(metadataHeading(block.split('\n')[0]))preamble.push(block);
      else records.push({heading:`Shot ${records.length+1}`,lines:block.split('\n'),parent:''});
    }
    result.globalNotes=preamble.join('\n\n').trim();
  }
  for(const record of records){
    const scene=bodyFields(record.lines,record.heading,result.scenes.length,record.parent);
    if(!scene.description&&!scene.prompt&&!scene.imagePrompt&&!scene.narration&&!scene.dialogue){
      result.warnings.push(`Bỏ tiêu đề không có nội dung: ${scene.title}`);continue;
    }
    if(record.context)scene.description=[record.context,scene.description].filter(Boolean).join('\n');
    const count=autoSplit&&!hasShots?Math.ceil(scene.duration/max):1;
    if(count===1){result.scenes.push(scene);continue;}
    const sentences=scene.description.split(/(?<=[.!?。])\s+|\n+/).filter(Boolean);
    const chunk=Math.max(1,Math.ceil(sentences.length/count));
    for(let i=0;i<count;i++){
      const description=sentences.slice(i*chunk,(i+1)*chunk).join(' ')||scene.description;
      result.scenes.push(createScene(result.scenes.length,{...scene,id:globalThis.crypto.randomUUID(),parentScene:scene.title,
        title:`${scene.title} · Shot ${i+1}`,duration:Math.min(max,scene.duration-i*max),description,
        // Do not repeat a whole narration/dialogue on every automatically split shot.
        narration:i===0?scene.narration:'',dialogue:i===0?scene.dialogue:''}));
    }
    result.warnings.push(`${scene.title}: chia ${count} shot theo thời lượng. Cần duyệt hành động và phân bố lại lời thoại/lời dẫn.`);
  }
  if(result.globalNotes)result.warnings.unshift('Ghi chú trước cảnh đầu đã được tách riêng, không tạo card giả.');
  if(!result.scenes.length)result.warnings.push('Chưa tìm thấy shot có nội dung. Hãy thêm mô tả dưới tiêu đề.');
  return result;
}
export const splitScript=text=>parseScript(text).scenes;

export function buildImagePrompt(project,scene){
  const refs=project.references.filter(r=>scene.referenceIds.includes(r.id));
  return ['Generate ONE finished cinematic storyboard IMAGE now using the attached reference images. Do not only describe how to create it.',
    `Aspect ratio: ${project.ratio}. Style: ${project.style}.`,project.bible&&`World and continuity: ${project.bible}`,
    scene.parentScene&&`Scene context: ${scene.parentScene}`,`Shot: ${scene.title}. ${scene.description}`,
    `Framing: ${scene.shot}. Camera intention: ${scene.camera}. Emotion: ${scene.emotion||'natural, story-driven'}.`,
    ...refs.map(r=>`Keep reference ${r.kind} ${r.name}: ${r.description}`),
    scene.imagePrompt||scene.prompt,
    'Preserve the identities, costumes, props and environment from the attached references. No added captions or logos. Return the generated image, not a reference-board collage.'
  ].filter(Boolean).join('\n\n');
}
export function buildShotlistPrompt(project,maxDuration=8){
  return `Chuyển kịch bản dưới đây thành danh sách SHOT điện ảnh chi tiết bằng tiếng Việt. Giữ cốt truyện, reference và lời thoại; nếu đã có SHOT thì giữ cấu trúc và làm rõ mô tả. Không tạo ảnh/video ở bước này. Mỗi shot tối đa ${maxDuration} giây. Bắt đầu cảnh bằng CẢNH n — tên, mỗi shot bằng SHOT n — tên. Sau đó dùng các dòng MÔ TẢ:, CỠ CẢNH:, MÁY QUAY:, THỜI LƯỢNG: số giây, LỜI DẪN:, HỘI THOẠI:, IMAGE PROMPT:. Lặp HỘI THOẠI: nếu nhiều người nói. IMAGE PROMPT bằng tiếng Anh, lời thoại giữ ngôn ngữ gốc. Ghi quy tắc chung trước cảnh đầu, không dùng code block.\nPhong cách: ${project.style}\nHồ sơ: ${project.bible}\nReference: ${project.references.map(r=>`${r.name}: ${r.description}`).join('; ')}\nKỊCH BẢN:\n${project.story}`;
}
