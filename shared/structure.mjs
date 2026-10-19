const pad=n=>String(n).padStart(3,'0');
export function displayTitle(value,kind='scene'){
  const title=String(value||'').replace(/^(?:CẢNH|SCENE|SHOT|SHORT|CÚ MÁY|CÚ QUAY|PHÂN CẢNH)\s*#?\s*\d+[a-z]?(?:[–-]\d+)?\b\s*(?:[—–:\-]\s*)?/i,'').replace(/^\|\s*/, '').replace(/\s*\|\s*\d{1,2}:\d{2}.*$/,'').trim();
  return title&&!/^\d{1,2}:\d{2}/.test(title)?title:kind==='shot'?'Shot chưa đặt tên':'Cảnh chưa đặt tên';
}
export const createGroup=(title='Cảnh mới')=>({id:`g-${crypto.randomUUID()}`,title,description:'',referenceIds:[]});

/** Legacy scenes are production shots. Group them without changing stable IDs/media. */
export function normalizeProject(project){
  const p=structuredClone(project);
  p.structureVersion=2;p.sceneGroups ||= [];
  const groups=new Map(p.sceneGroups.map(g=>[g.id,g]));
  const legacyParents=new Map();
  for(const shot of p.scenes){
    if(shot.groupId&&groups.has(shot.groupId))continue;
    const parent=shot.parentScene?.trim();
    let group=parent?legacyParents.get(parent):null;
    if(!group){group={id:`g-${shot.id}`,title:parent||shot.title,description:'',referenceIds:[]};groups.set(group.id,group);if(parent)legacyParents.set(parent,group);}
    shot.groupId=group.id;
  }
  p.sceneGroups=[...groups.values()].map(g=>({...g,referenceIds:g.referenceIds||[]}));
  const buckets=new Map();for(const shot of p.scenes){if(!buckets.has(shot.groupId))buckets.set(shot.groupId,[]);buckets.get(shot.groupId).push(shot);}
  p.scenes=p.sceneGroups.flatMap(g=>buckets.get(g.id)||[]);
  return p;
}
export const orderedShots=p=>normalizeProject(p).scenes;
export function shotLabels(project){
  const p=normalizeProject(project);
  /** @type {Record<string,{code:string,sceneCode:string,sceneIndex:number,shotIndex:number,start:number,end:number,filename:string}>} */
  const labels={};
  const buckets=new Map();for(const shot of p.scenes){if(!buckets.has(shot.groupId))buckets.set(shot.groupId,[]);buckets.get(shot.groupId).push(shot);}
  p.sceneGroups.forEach((group,gi)=>{let time=0;(buckets.get(group.id)||[]).forEach((s,si)=>{const code=`C${pad(gi+1)}-S${pad(si+1)}`;labels[s.id]={code,sceneCode:`C${pad(gi+1)}`,sceneIndex:gi+1,shotIndex:si+1,start:time,end:time+s.duration,filename:code};time+=s.duration;});});
  return labels;
}
export function effectiveReferenceIds(project,shot){
  const group=project.sceneGroups?.find(g=>g.id===shot.groupId);
  const inherited=[...project.references.filter(r=>r.applyToAll).map(r=>r.id),...(group?.referenceIds||[])];
  return [...new Set([...inherited,...shot.referenceIds])].filter(id=>project.references.some(r=>r.id===id)&&!(shot.excludedReferenceIds||[]).includes(id));
}
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchedReferenceIds(references,text){
  const haystack=` ${normalized(text)} `;
  return references.filter(r=>[r.name,...(r.aliases||[])].some(name=>{const needle=normalized(name);return needle.length>=2&&haystack.includes(` ${needle} `);})).map(r=>r.id);
}
export function assignReferences(project,shotIds){
  const p=normalizeProject(project),selected=shotIds?new Set(shotIds):null;
  p.scenes=p.scenes.map(s=>{
    if(selected&&!selected.has(s.id))return s;
    const group=p.sceneGroups.find(g=>g.id===s.groupId);
    const matches=matchedReferenceIds(p.references,[s.title,s.description,s.prompt,s.imagePrompt,group?.title,group?.description].join('\n'));
    const shot={...s,referenceIds:[...new Set([...s.referenceIds,...matches])],refAssignment:matches.length?'matched':'needs-review'};
    if(!matches.length&&effectiveReferenceIds(p,shot).length)shot.refAssignment='inherited';
    return shot;
  });return p;
}
export function toggleShotReference(project,shotId,refId){
  const p=normalizeProject(project),shot=p.scenes.find(s=>s.id===shotId);if(!shot)return p;
  if(effectiveReferenceIds(p,shot).includes(refId)){shot.referenceIds=shot.referenceIds.filter(id=>id!==refId);shot.excludedReferenceIds=[...new Set([...(shot.excludedReferenceIds||[]),refId])];}
  else{shot.referenceIds=[...new Set([...shot.referenceIds,refId])];shot.excludedReferenceIds=(shot.excludedReferenceIds||[]).filter(id=>id!==refId);}
  shot.refAssignment='manual';return p;
}
export function moveShot(project,id,delta){
  const p=normalizeProject(project),index=p.scenes.findIndex(s=>s.id===id),other=p.scenes[index+delta];
  if(index<0||!other||other.groupId!==p.scenes[index].groupId)return p;
  [p.scenes[index],p.scenes[index+delta]]=[p.scenes[index+delta],p.scenes[index]];return p;
}
