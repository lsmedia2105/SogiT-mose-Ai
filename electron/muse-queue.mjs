import { randomUUID } from 'node:crypto';

export const ACTIVE_STATES=new Set(['queued','attaching','sending','sent','downloading']);
export function interruptedHistory(items){return items.map(item=>ACTIVE_STATES.has(item.status)?{...item,status:'interrupted',error:'Ứng dụng đã đóng trước khi ghi nhận kết quả. Kiểm tra Muse; không tự gửi lại.'}:item);}

/** Sequential, stop-on-first-error. Sending is never automatically retried. */
export async function runQueue({tasks,perform,persist,onUpdate,signal}){
  for(let index=0;index<tasks.length;index++){
    const item=tasks[index];
    if(signal.aborted){item.status='cancelled';continue;}
    let submitted=false;
    try{
      const result=await perform(item,async state=>{
        signal.throwIfAborted();item.status=state;
        if(state==='sending'||state==='sent'){submitted=true;item.submittedAt ||= new Date().toISOString();}
        await persist();onUpdate(item,index);
      });
      item.status='done';item.completedAt=new Date().toISOString();Object.assign(item,result);
      await persist();onUpdate(item,index);
    }catch(error){
      item.status=submitted?'uncertain':signal.aborted?'cancelled':'error';
      item.error=signal.aborted?(submitted?'Đã dừng chờ. Muse có thể vẫn đang tạo; kiểm tra trước khi gửi lại.':'Đã dừng trước khi gửi.'):String(error.message||error);
      for(const next of tasks.slice(index+1))next.status='paused';
      await persist();onUpdate(item,index);break;
    }
  }
  for(const item of tasks)if(item.status==='queued')item.status='paused';
  await persist();
  return {done:tasks.filter(t=>t.status==='done').length,total:tasks.length,status:tasks.every(t=>t.status==='done')?'done':signal.aborted?'cancelled':'error'};
}
export function taskRecord(changes){return {id:randomUUID(),createdAt:new Date().toISOString(),status:'queued',...changes};}
