import {discordCropRect} from '../lib/scan-utils.mjs';
import {maskBottomPhoto} from '../lib/media-guard.mjs';
import {maskReactionRows} from '../lib/reaction-guard.mjs';
import {evaluateText} from './metrics.mjs';

const $=id=>document.getElementById(id);
const OCR_URL='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let latestSummary='';
function log(message){$('progress').textContent=message;}
function scriptLoaded(url){return new Promise((resolve,reject)=>{
 if(window.Tesseract)return resolve();
 const tag=document.createElement('script');tag.src=url;tag.crossOrigin='anonymous';
 tag.onload=()=>window.Tesseract?resolve():reject(new Error('Tesseract โหลดไม่สมบูรณ์'));
 tag.onerror=()=>reject(new Error('โหลด Tesseract จาก CDN ไม่ได้'));
 document.head.append(tag);
});}
async function prepareCanvas(file,cropEnabled){
 const url=URL.createObjectURL(file);
 try {
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('เปิดไฟล์ภาพไม่สำเร็จ'));img.src=url;});
  const area=discordCropRect(img.naturalWidth,img.naturalHeight,cropEnabled);
  const scale=Math.min(1,1800/area.width),width=Math.max(1,Math.round(area.width*scale)),height=Math.max(1,Math.round(area.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.getContext('2d').drawImage(img,area.x,area.y,area.width,area.height,0,0,width,height);
  // Replicate stable current ChatLens steps, but don't record any pixel data.
  let media=false,reactionRows=0;
  try {if(area.cropped)media=!!maskBottomPhoto(canvas);}catch(_ignored){}
  try {reactionRows=maskReactionRows(canvas);}catch(_ignored){}
  return {canvas,media,reactionRows,dimensions:`${img.naturalWidth}×${img.naturalHeight} → ${width}×${height}`};
 } finally {URL.revokeObjectURL(url);}
}
function formatScore(metrics){
 return metrics ? `CER ${metrics.strictCer==null?'N/A':(metrics.strictCer*100).toFixed(1)+'%'} · CER ไม่คิดช่องว่าง ${metrics.compactCer==null?'N/A':(metrics.compactCer*100).toFixed(1)+'%'} · แก้ไข ${metrics.strictEdits}/${metrics.referenceGraphemes} graphemes` : 'ไม่มีข้อความเฉลย: ยังวัดความถูกต้องไม่ได้';
}
$('run').addEventListener('click',async()=>{
 const file=$('picture').files?.[0];if(!file){log('เลือกรูปก่อนจ้า');return;}
 $('run').disabled=true;$('out').hidden=true;
 let worker;
 try{
  const start=performance.now();
  log('เตรียมภาพสำหรับ OCR บนอุปกรณ์...');
  const prepared=await prepareCanvas(file,$('crop').checked);
  log('กำลังโหลดตัวอ่านภาษาไทย/อังกฤษ...');
  await scriptLoaded(OCR_URL);
  worker=await window.Tesseract.createWorker('tha+eng',1,{});
  const result=[];
  for(const mode of ($('psm6').checked?['default','psm6']:['default'])) {
   if(mode==='psm6')await worker.setParameters({tessedit_pageseg_mode:'6'});
   log(mode==='default'?'อ่านภาพด้วยค่าเริ่มต้น (เหมือน ChatLens)...':'อ่านภาพด้วย PSM 6 (ทดลอง)...');
   const began=performance.now();
   const data=(await worker.recognize(prepared.canvas,{}, {text:true,blocks:true})).data;
   result.push({mode,ms:Math.round(performance.now()-began),text:data.text,score:evaluateText($('truth').value,data.text)});
  }
  latestSummary=[`ChatLens OCR Benchmark (local-only)`,`File: ${file.name} (file name only)`,`Image: ${prepared.dimensions}`,`Reaction rows masked: ${prepared.reactionRows}`,`Image attachment masked: ${prepared.media?'yes':'no'}`, ...result.map(r=>`${r.mode}: ${r.ms} ms · ${formatScore(r.score)}`),`Startup + processing: ${Math.round(performance.now()-start)} ms`,`Notes: Tesseract.js 6 tha+eng; this measures neither author/reply correctness nor completeness.`,`Ground truth is not included in copied summary.`].join('\n');
  $('report').textContent=latestSummary;
  $('recognized').value=result.map(r=>`==== ${r.mode} ====\n${r.text}`).join('\n\n');
  $('out').hidden=false;
  log('✓ เสร็จแล้ว โปรดดูผลเปรียบเทียบ');
 } catch(error){log('❌ '+(error?.message||String(error)));}
 finally{if(worker)try{await worker.terminate();}catch(_ignored){};$('run').disabled=false;}
});
$('copy-summary').addEventListener('click',async()=>{
 if(!latestSummary)return;
 try {await navigator.clipboard.writeText(latestSummary);log('✓ คัดลอกสรุปแล้ว (ไม่รวมภาพหรือข้อความแชท)');}
 catch(_){log('คัดลอกอัตโนมัติไม่ได้: เลือกข้อความจากกล่องสรุปแทนได้จ้า');}
});
