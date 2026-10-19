/** Runs inside the remote page. Never reads cookies, storage, passwords or tokens. */
export function museDOM({action,selectors={},marker='',referenceCount=0}) {
  const visible=el=>!!el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&getComputedStyle(el).visibility!=='hidden';
  const text=el=>(el?.isContentEditable?el.innerText:el?.value||'').trim();
  const query=selector=>{try{return [...document.querySelectorAll(selector)];}catch{throw new Error('CSS selector Muse không hợp lệ.');}};
  const editable=el=>visible(el)&&!el.disabled&&(el.tagName==='TEXTAREA'||el.isContentEditable||el.getAttribute('role')==='textbox')&&!/search|tìm kiếm/i.test(`${el.getAttribute('aria-label')||''} ${el.getAttribute('placeholder')||''}`);
  const allEditors=query(selectors.composer||'textarea,[contenteditable="true"],[role="textbox"][aria-multiline="true"]').filter(editable);
  const active=allEditors.find(el=>el===document.activeElement||el.contains(document.activeElement));
  const composer=active||(allEditors.length===1?allEditors[0]:null);
  const label=el=>`${el.getAttribute('aria-label')||''} ${el.getAttribute('title')||''} ${el.getAttribute('data-testid')||''} ${el.innerText||''}`.trim();
  const disabled=el=>el.disabled||el.getAttribute('aria-disabled')==='true';
  function sendButton(){
    if(selectors.send){const buttons=query(selectors.send).filter(el=>visible(el)&&!disabled(el));return buttons.length===1?buttons[0]:null;}
    if(!composer)return null;
    const form=composer.closest('form');
    let scope=form||composer.parentElement;
    for(let depth=0;scope&&depth<5;depth++,scope=scope.parentElement){
      const buttons=[...scope.querySelectorAll('button,[role="button"],input[type="submit"]')].filter(el=>visible(el)&&!disabled(el));
      const candidates=buttons.filter(el=>/^(?:send|send message|submit|gửi|gửi tin nhắn|send-message)(?:\s|$)/i.test(label(el))||(form&&el.type==='submit'&&!/cancel|hủy|stop|dừng/i.test(label(el))));
      if(candidates.length===1)return candidates[0];
      if(candidates.length>1)return null;
      if(scope===form)break;
    }
    return null;
  }
  const assistantSelector=selectors.result||'[data-message-author-role="assistant"],[data-role="assistant"],[data-author="assistant"],[data-sender="assistant"],[data-message-role="assistant"],[data-is-user="false"],.assistant-message,.message.assistant,[data-testid="assistant-message"],[data-testid^="conversation-turn-assistant"]';
  const containers=query(assistantSelector).filter((el,_,all)=>!all.some(other=>other!==el&&other.contains(el)));
  const results=containers.map(el=>{
    if(!el.dataset.sogitResult)el.dataset.sogitResult=crypto.randomUUID();
    const id=el.dataset.sogitResult;
    const media=[...el.querySelectorAll('img,video,a[download]')].filter(node=>{
      if(node.tagName==='IMG')return node.complete&&node.naturalWidth>=128&&node.naturalHeight>=128&&!/avatar|emoji|icon/i.test(`${node.className} ${node.getAttribute('alt')||''}`);
      if(node.tagName==='VIDEO')return !!(node.currentSrc||node.src||node.querySelector('source')?.src);
      return /\.(?:mp4|webm)(?:\?|$)/i.test(node.href);
    }).map(node=>({src:node.tagName==='A'?node.href:node.currentSrc||node.src||node.querySelector('source')?.src,kind:node.tagName==='IMG'?'image':'video',key:`${id}|${node.tagName==='A'?node.href:node.currentSrc||node.src||node.querySelector('source')?.src}`}));
    return {id,text:(el.innerText||'').trim().slice(0,250000),media};
  });
  const fileInputs=query(selectors.file||'input[type="file"]').filter(el=>!el.disabled&&(!el.accept||/image|png|jpg|jpeg|webp|\*/i.test(el.accept)));
  if(action==='probe')return {url:location.origin,composer:!!composer,composerCount:allEditors.length,draft:!!text(composer),send:!!sendButton(),fileInputs:fileInputs.length,assistantContainers:containers.length};
  if(action==='focus'){
    if(!composer)throw new Error('Không xác định được một ô nhập chat Muse. Mở chat, bấm vào ô Message rồi kiểm tra lại.');
    if(text(composer))throw new Error('Ô nhập Muse đang có bản nháp. Gửi hoặc xóa bản nháp đó trước; Studio không ghi đè nội dung đang soạn.');
    query('[data-sogit-composer]').forEach(el=>delete el.dataset.sogitComposer);
    composer.dataset.sogitComposer='active';composer.focus();return true;
  }
  if(action==='attachment'){
    if(fileInputs.length!==1)throw new Error(fileInputs.length?'Có nhiều ô tải file trên Muse; chưa thể tự chọn an toàn.':'Không tìm thấy ô đính kèm ảnh. Mở nút + / đính kèm trong Muse rồi kiểm tra lại.');
    if(referenceCount>1&&!fileInputs[0].multiple)throw new Error('Ô đính kèm Muse hiện chỉ nhận một file. Chưa gửi yêu cầu; hãy chọn ít reference hơn.');
    fileInputs[0].dataset.sogitFile='active';return '[data-sogit-file="active"]';
  }
  if(action==='open-attachment'){
    const buttons=query('button,[role="button"]').filter(el=>visible(el)&&!disabled(el)&&/^(?:attach|upload|đính kèm|tải lên|thêm tệp|add files?|\+)(?:\s|$)/i.test(label(el)));
    if(buttons.length===1){buttons[0].click();return true;}return false;
  }
  if(action==='send'){
    const marked=document.querySelector('[data-sogit-composer="active"]');
    if(!marked||!text(marked).includes(marker))throw new Error('Ô nhập đã thay đổi. Studio chưa bấm gửi.');
    const button=sendButton();if(button){button.scrollIntoView({block:'nearest'});const rect=button.getBoundingClientRect();return {method:'button',x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};}marked.focus();return {method:'enter'};
  }
  if(action==='snapshot')return {results,busy:query('[aria-busy="true"]').some(visible)||query('button').some(el=>visible(el)&&/^(?:stop generating|stop response|dừng tạo|dừng phản hồi|stop generation)$/i.test(label(el))),ack:!!marker&&!text(composer).includes(marker)&&(document.body.innerText||'').includes(marker)};
  if(action==='diagnostics')return {composerCount:allEditors.length,composers:allEditors.map(el=>({tag:el.tagName,role:el.getAttribute('role'),classes:String(el.className).slice(0,150)})),sendDetected:!!sendButton(),fileInputs:fileInputs.map(el=>({accept:el.accept,multiple:el.multiple,classes:String(el.className).slice(0,150)})),assistantContainers:containers.length,imageAncestors:query('img').filter(el=>el.naturalWidth>=128).slice(-8).map(el=>{const parents=[];for(let p=el.parentElement,i=0;p&&i<4;p=p.parentElement,i++)parents.push({tag:p.tagName,classes:String(p.className).slice(0,150),role:p.getAttribute('role'),'data-role':p.getAttribute('data-role'),'data-message-author-role':p.getAttribute('data-message-author-role')});return parents;})};
  throw new Error('Thao tác Muse không hợp lệ.');
}
