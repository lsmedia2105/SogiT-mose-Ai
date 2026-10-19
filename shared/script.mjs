import { effectiveReferenceIds } from './structure.mjs';
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

const timedHeading=line=>{
  const match=cleanHeading(line).match(/^(\d+(?:[.,]\d+)?)\s*[-–—−]\s*(\d+(?:[.,]\d+)?)\s*(?:giây|s|seconds)\s*[—–:\-]\s*(.*)$/i);
  if(!match)return null;
  const start=Number(match[1].replace(',','.')),end=Number(match[2].replace(',','.'));
  return end>start&&end-start<=600?{start,end,title:match[3],duration:end-start}:null;
};

/** A scene owns ordered shots. Explicit time ranges always remain within one scene. */
export function parseScript(text,{autoSplit=false,maxShotDuration=8}={}) {
  const source=String(text||'').replace(/\r\n?/g,'\n').trim();
  const result={scenes:[],sceneGroups:[],globalNotes:'',warnings:[],detected:'paragraphs'};
  if(!source)return result;
  const lines=source.split('\n'),max=Math.max(2,Math.min(60,Number(maxShotDuration)||8));
  const structured=lines.some(line=>sceneHeading(line)||shotHeading(line)||timedHeading(line));
  const records=[];let current=null,active=null,preamble=[];
  const makeGroup=title=>({id:`g-${crypto.randomUUID()}`,title,description:'',referenceIds:[],body:[],shots:[]});
  if(structured){
    result.detected=lines.some(line=>shotHeading(line)||timedHeading(line))?'shots':'scenes';
    for(const line of lines){
      if(sceneHeading(line)){current=makeGroup(cleanHeading(line));records.push(current);active=null;continue;}
      const timed=timedHeading(line);
      if(shotHeading(line)||timed){
        if(!current){current=makeGroup('Cảnh 1');records.push(current);}
        active={heading:timed?timed.title.slice(0,80)||`Shot ${current.shots.length+1}`:cleanHeading(line),lines:timed?[timed.title]:[],duration:timed?.duration};
        current.shots.push(active);continue;
      }
      if(current){
        if(active&&/^(?:Continuity|Âm thanh|Nhạc|Music|Sound|Ghi chú cảnh)\s*:/i.test(line.trim()))current.body.push(line);
        else (active?active.lines:current.body).push(line);
      }else preamble.push(line);
    }
  }else{
    for(const block of source.split(/\n\s*\n/).filter(Boolean)){
      if(metadataHeading(block.split('\n')[0]))preamble.push(block);
      else{const group=makeGroup(`Cảnh ${records.length+1}`);group.body=block.split('\n');records.push(group);}
    }
  }
  result.globalNotes=preamble.join('\n').trim();
  for(const record of records){
    const group={id:record.id,title:record.title,description:record.body.join('\n').trim(),referenceIds:[]};
    let shots=[];
    if(record.shots.length){
      for(const item of record.shots){
        const shot=bodyFields(item.lines,item.heading,result.scenes.length+shots.length,group.title);
        if(item.duration)shot.duration=item.duration;
        if(!shot.description&&!shot.prompt&&!shot.imagePrompt&&!shot.narration&&!shot.dialogue){result.warnings.push(`Bỏ tiêu đề không có nội dung: ${shot.title}`);continue;}
        if(group.description)shot.description=[group.description,shot.description].filter(Boolean).join('\n');
        shots.push(shot);
      }
    }else{
      const shot=bodyFields(record.body,group.title,result.scenes.length,group.title);
      if(shot.description||shot.prompt||shot.imagePrompt||shot.narration||shot.dialogue){
        const count=autoSplit?Math.ceil(shot.duration/max):1;
        const sentences=shot.description.split(/(?<=[.!?。])\s+|\n+/).filter(Boolean),chunk=Math.max(1,Math.ceil(sentences.length/count));
        for(let i=0;i<count;i++)shots.push({...shot,id:i?crypto.randomUUID():shot.id,title:count===1?shot.title:`Shot ${i+1}`,duration:Math.min(max,shot.duration-i*max),description:count===1?shot.description:sentences.slice(i*chunk,(i+1)*chunk).join(' ')||shot.description,narration:i===0?shot.narration:'',dialogue:i===0?shot.dialogue:''});
        if(!autoSplit)shots[0].duration=shot.duration;
        if(count>1)result.warnings.push(`${group.title}: chia ${count} shot theo thời lượng trong cùng một cảnh. Cần duyệt hành động và lời thoại.`);
      }
    }
    if(!shots.length){result.warnings.push(`Bỏ tiêu đề không có nội dung: ${group.title}`);continue;}
    result.sceneGroups.push(group);result.scenes.push(...shots.map(shot=>({...shot,groupId:group.id})));
  }
  if(result.globalNotes)result.warnings.unshift('Ghi chú trước cảnh đầu đã được tách riêng, không tạo card giả.');
  if(!result.scenes.length)result.warnings.push('Chưa tìm thấy shot có nội dung.');
  return result;
}
export const splitScript=text=>parseScript(text).scenes;

export function buildImagePrompt(project,scene){
  const refs=project.references.filter(r=>effectiveReferenceIds(project,scene).includes(r.id));
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
  return `Chuyển kịch bản dưới đây thành danh sách SHOT điện ảnh chi tiết bằng tiếng Việt. Giữ cốt truyện, reference và lời thoại. Một CẢNH chứa các SHOT: các mốc 0–2, 2–4, 4–6, 6–8 giây là 4 shot trong một cảnh 8 giây, không phải 4 cảnh độc lập. Giữ tổng thời lượng cảnh khi đã được chỉ định; nếu đã có SHOT thì giữ cấu trúc và làm rõ mô tả. Không tạo ảnh/video ở bước này. Mỗi shot tối đa ${maxDuration} giây. Bắt đầu cảnh bằng CẢNH n — tên, mỗi shot bằng SHOT n — tên. Sau đó dùng các dòng MÔ TẢ:, CỠ CẢNH:, MÁY QUAY:, THỜI LƯỢNG: số giây, LỜI DẪN:, HỘI THOẠI:, IMAGE PROMPT:. Lặp HỘI THOẠI: nếu nhiều người nói. IMAGE PROMPT bằng tiếng Anh, lời thoại giữ ngôn ngữ gốc. Ghi quy tắc chung trước cảnh đầu, không dùng code block.\nPhong cách: ${project.style}\nHồ sơ: ${project.bible}\nReference: ${project.references.map(r=>`${r.name}: ${r.description}`).join('; ')}\nKỊCH BẢN:\n${project.story}`;
}
