import { orderedShots } from './structure.mjs';
export function toSrt(project) {
  const stamp = seconds => { const ms=Math.round(seconds*1000); return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`; };
  let time=0, index=0; const blocks=[];
  for (const scene of orderedShots(project)) {
    const text=[scene.narration,scene.dialogue].filter(Boolean).join('\n');
    if(text) blocks.push(`${++index}\n${stamp(time)} --> ${stamp(time+scene.duration)}\n${text}`);
    time+=scene.duration;
  }
  return blocks.join('\n\n')+'\n';
}
