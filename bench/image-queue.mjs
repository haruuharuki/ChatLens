// E.2: queue order is explicit. Cross-image merging requires visual overlap.
import {mergeQueueRecords} from './queue-merge.mjs?v=e2';
export const MAX_QUEUE_IMAGES=20;
export function moveQueueItem(entries,index,delta){
 const next=index+delta;
 if(!Number.isInteger(index)||![-1,1].includes(delta)||index<0||index>=entries.length||next<0||next>=entries.length)return entries.slice();
 const copy=entries.slice();[copy[index],copy[next]]=[copy[next],copy[index]];return copy;
}
export async function runImageQueue(files,{read,stopped=()=>false,changed=()=>{}}){
 if(!files.length||files.length>MAX_QUEUE_IMAGES)throw new RangeError('Invalid queue size');
 const results=files.map(()=>({state:'pending',text:'',diagnostic:''}));
 for(let i=0;i<files.length;i++){
  if(stopped())break;
  results[i]={state:'reading',text:'',diagnostic:''};changed(results,i);
  try{
   const result=await read(files[i],i);
   results[i]={state:['done','partial','failed','cancelled'].includes(result.state)?result.state:'failed',text:String(result.text||''),diagnostic:String(result.diagnostic||''),...(result.state==='done'&&result.records?{records:result.records}:{})};
  }catch(_){results[i]={state:'failed',text:'',diagnostic:'Image processing failed'};}
  changed(results,i);
  if(results[i].state==='cancelled')break;
 }
 return results;
}
export function formatQueueTranscript(results){
 if(results.some(r=>r.records))return mergeQueueRecords(results).text;
 return results.map((r,i)=>{
  const title=`--- ภาพ ${i+1} ---`;
  if(r.state==='done')return title+'\n'+r.text;
  if(r.state==='partial')return title+'\n[ผลบางส่วน โปรดตรวจภาพ]\n'+r.text;
  if(r.state==='failed')return title+'\n[อ่านภาพไม่สำเร็จ]';
  if(r.state==='cancelled')return title+'\n[หยุดก่อนอ่านครบ]';
  return title+'\n[ยังไม่ได้อ่าน]';
 }).join('\n\n');
}
