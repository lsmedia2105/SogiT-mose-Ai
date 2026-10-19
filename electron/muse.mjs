import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { museDOM } from './muse-dom.mjs';
import { realChild } from './store.mjs';

export const MUSE_ORIGINS=['https://muse.ai','https://www.muse.ai'];
export async function inspectMuse(win,selectors={}){
  if(win.isDestroyed())throw new Error('Cửa sổ Muse đã đóng.');
  if(!MUSE_ORIGINS.includes(new URL(win.webContents.getURL()).origin))throw new Error('Chưa ở trang Muse đã đăng nhập. Hãy hoàn tất đăng nhập trước.');
  return readDOM(win,{action:'probe',selectors});
}
export async function diagnoseMuse(win,selectors={}){await inspectMuse(win,selectors);return readDOM(win,{action:'diagnostics',selectors});}
function readDOM(win,args){check(win);return win.webContents.executeJavaScript(`(()=>{if(!${JSON.stringify(MUSE_ORIGINS)}.includes(location.origin))throw new Error('Muse đã chuyển trang; dừng thao tác.');return (${museDOM.toString()})(${JSON.stringify(args)});})()`);}
function check(win,signal){signal?.throwIfAborted();if(win.isDestroyed())throw new Error('Cửa sổ Muse đã đóng; không tự gửi lại để tránh trùng yêu cầu.');const origin=new URL(win.webContents.getURL()).origin;if(!MUSE_ORIGINS.includes(origin))throw new Error('Muse đã chuyển sang trang đăng nhập hoặc trang khác. Hãy kiểm tra cửa sổ Muse.');}
async function attachReferences(win,files,selectors,signal){
  if(!files.length)return;
  const probe=await inspectMuse(win,selectors);
  if(!probe.fileInputs){await readDOM(win,{action:'open-attachment',selectors});await delay(500,undefined,{signal});}
  const selector=await readDOM(win,{action:'attachment',selectors,referenceCount:files.length});
  const debug=win.webContents.debugger;
  if(debug.isAttached())throw new Error('Đóng DevTools của Muse trước khi tự đính kèm reference.');
  debug.attach('1.3');
  try{await debug.sendCommand('DOM.enable');const {root}=await debug.sendCommand('DOM.getDocument');const {nodeId}=await debug.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector});if(!nodeId)throw new Error('Ô tải file đã thay đổi. Chưa gửi yêu cầu.');check(win,signal);await debug.sendCommand('DOM.setFileInputFiles',{nodeId,files});}
  finally{debug.detach();}
  await delay(1800,undefined,{signal});
}

/** One send only. Any failure after sending is uncertain and must never auto-retry. */
export async function generateMuse({win,prompt,kind='image',files=[],selectors={},signal,onState=()=>{},timeoutMs=600000,pollMs=1200,settleMs=3000}){
  check(win,signal);const probe=await inspectMuse(win,selectors);
  if(!probe.composer)throw new Error('Muse chưa có ô chat sẵn sàng. Đăng nhập, mở chat và bấm Kiểm tra Muse.');
  if(probe.draft)throw new Error('Ô chat Muse đang có bản nháp. Studio chưa gửi; hãy xử lý bản nháp trước.');
  await onState('attaching');await attachReferences(win,files,selectors,signal);
  check(win,signal);await readDOM(win,{action:'focus',selectors});
  const marker=`SOGIT_JOB_${randomUUID().replaceAll('-','')}`;
  await win.webContents.insertText(`${prompt}\n\nRequest ID: ${marker} (tracking only; do not print this ID in the image).`);
  await delay(400,undefined,{signal});
  const baseline=await readDOM(win,{action:'snapshot',selectors});
  const oldMedia=new Set(baseline.results.flatMap(r=>r.media.map(m=>m.key)));
  const oldText=new Map(baseline.results.map(r=>[r.id,r.text]));
  check(win,signal);
  await onState('sending'); // Persist uncertainty before interacting with the remote send control.
  const send=await readDOM(win,{action:'send',selectors,marker});
  win.focus();win.webContents.focus();
  if(send.method==='enter'){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});}
  else{win.webContents.sendInputEvent({type:'mouseMove',x:send.x,y:send.y});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:send.x,y:send.y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:send.x,y:send.y});}
  await onState('sent');
  const start=Date.now();let stableKey='',stableSince=0,acked=false;
  while(Date.now()-start<timeoutMs){
    await delay(pollMs,undefined,{signal});check(win,signal);
    const snap=await readDOM(win,{action:'snapshot',selectors,marker});acked ||= snap.ack;
    const changed=snap.results.filter(r=>!oldText.has(r.id)||oldText.get(r.id)!==r.text);
    const last=changed.at(-1);
    if(last&&/quota exceeded|rate limit exceeded|insufficient (?:credits|tokens)|không đủ (?:token|credit)|đã hết hạn mức/i.test(last.text))throw new Error('Muse báo hết hạn mức hoặc giới hạn tốc độ. Dừng hàng đợi; không tự chuyển tài khoản hay gửi lại.');
    let candidate;
    if(kind==='script')candidate=last?.text?.length>40?{text:last.text,key:`${last.id}|${last.text}`} : null;
    else{
      const media=snap.results.flatMap(r=>r.media).filter(m=>m.kind===kind&&!oldMedia.has(m.key));
      const found=media.at(-1);candidate=found?{...found,key:found.key}:null;
    }
    if(candidate&&!snap.busy){
      if(candidate.key!==stableKey){stableKey=candidate.key;stableSince=Date.now();}
      else if(Date.now()-stableSince>=settleMs){await onState('downloading');return candidate;}
    }else {stableKey='';stableSince=0;}
    if(!acked&&!candidate&&Date.now()-start>12000)throw new Error('Chưa xác nhận được Muse đã nhận yêu cầu. Kiểm tra cửa sổ Muse trước khi bấm tạo lại; Studio không tự gửi lần hai.');
    if(acked&&!snap.results.length&&Date.now()-start>45000)throw new Error('Yêu cầu đã gửi nhưng chưa nhận diện được vùng trả lời của Muse. Kiểm tra kết quả trong Muse; cần cập nhật bộ nhận diện, không tự gửi lại.');
  }
  throw new Error('Hết thời gian chờ Muse. Yêu cầu có thể vẫn đang chạy; kiểm tra Muse trước khi tạo lại.');
}

export function sniffMedia(bytes,kind){
  if(kind==='image'){
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return '.jpg';
    if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return '.webp';
  }else{
    if(bytes.toString('ascii',4,8)==='ftyp')return '.mp4';
    if(bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))return '.webm';
  }
  throw new Error('Kết quả không phải file media được hỗ trợ. Chưa lưu thành công; xem kết quả trong Muse.');
}
export async function downloadMuseMedia({win,src,kind,root,signal,decodeImage}){
  check(win,signal);const url=new URL(src);
  if(!['https:','blob:','data:'].includes(url.protocol))throw new Error('Đường dẫn media Muse không được hỗ trợ.');
  const limit=kind==='image'?40*1024**2:500*1024**2;
  let buffer;
  if(url.protocol==='https:'){
    const response=await win.webContents.session.fetch(src,{credentials:'include',signal,redirect:'follow'});
    if(!response.ok)throw new Error(`Không tải được media từ Muse (HTTP ${response.status}). Kết quả có thể vẫn có trong Muse.`);
    if(Number(response.headers.get('content-length'))>limit)throw new Error('Media vượt giới hạn tải tự động. Tải thủ công trong Muse.');
    const chunks=[];let size=0;
    for await(const chunk of response.body){signal?.throwIfAborted();size+=chunk.byteLength;if(size>limit){await response.body.cancel?.().catch(()=>{});throw new Error('Media quá lớn để tải tự động.');}chunks.push(Buffer.from(chunk));}
    buffer=Buffer.concat(chunks);
  }else{
    if(kind==='video')throw new Error('Muse trả video dạng blob/luồng. Chưa hỗ trợ lấy luồng này; hãy tải video trong Muse rồi nhập vào cảnh.');
    if(url.protocol==='blob:'&&!MUSE_ORIGINS.includes(url.origin))throw new Error('Blob không thuộc phiên Muse.');
    const encoded=await win.webContents.executeJavaScript(`(async()=>{const r=await fetch(${JSON.stringify(src)});const b=await r.blob();if(b.size>${limit})throw new Error('Image too large');return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Cannot read image'));reader.readAsDataURL(b);});})()`);
    buffer=Buffer.from(encoded,'base64');
  }
  signal?.throwIfAborted();const ext=sniffMedia(buffer,kind);
  if(kind==='image'&&decodeImage){const image=decodeImage(buffer);if(image.isEmpty())throw new Error('Ảnh Muse tải về không giải mã được.');}
  const id=randomUUID(),relative=`assets/${id}${ext}`;
  await fs.mkdir(path.join(root,'assets'),{recursive:true});await realChild(root,'assets');
  const dest=path.join(root,relative),temp=`${dest}.part`;
  try{await fs.writeFile(temp,buffer);await fs.rename(temp,dest);}finally{await fs.rm(temp,{force:true});}
  return {id,path:relative,name:`Muse-${kind}-${id.slice(0,8)}${ext}`,type:kind,createdAt:new Date().toISOString()};
}
