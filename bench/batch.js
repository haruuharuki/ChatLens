import {discordCropRect} from '../lib/scan-utils.mjs';
import {extractOCRLines} from '../lib/discord-structure.mjs';
import {evaluateAlignedSamples,evaluateText} from './metrics.mjs';
import {chooseBatchLines,compareRuns,safeBatchReport} from './batch-core.mjs';
import {MODEL_PATH,DICTIONARY_PATH,ORT_VERSION,OPEN_THAI_REVISION,recognitionSize,recognitionTensorFromRGBA,greedyCTC,parseDictionary,usableLineBox} from './openthai-core.mjs';
import {runtimeSources,diagnosticReport} from './runtime-loader.mjs';

const $=id=>document.getElementById(id);
const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let imageCanvas=null,ocrLines=[],scannedFile=null,worker=null,onnx=null,ort=null,dictionary=null;
let modelLoadMs=0,tesseractMs=0,totalInferenceMs=0;
let items=[],busy=false,stopRequested=false,wasCancelled=false,runtimeAttempts=[],stage='idle';
function say(text){$('status').textContent=text;}
function toggleBusy(on){busy=on;$('start').disabled=on;$('photo').disabled=on;$('scope').disabled=on;$('crop').disabled=on;$('channels').disabled=on;$('invert').disabled=on;$('stop').disabled=!on;}
function makeStat(label,value){const e=document.createElement('div');e.className='stat';const name=document.createElement('small');name.textContent=label;const strong=document.createElement('strong');strong.textContent=value;e.append(name,strong);return e;}
function setImageCanvas(image){
 const crop=discordCropRect(image.naturalWidth,image.naturalHeight,$('crop').checked);
 const scale=Math.min(1,1500/crop.width);const c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(crop.width*scale));c.height=Math.max(1,Math.round(crop.height*scale));
 c.getContext('2d',{willReadFrequently:true}).drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,c.width,c.height);
 return c;
}
async function loadImage(file){
 const url=URL.createObjectURL(file);
 try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));img.src=url;});return img;}
 finally{URL.revokeObjectURL(url);}
}
async function getWorker(){
 if(worker)return worker;
 if(!window.Tesseract){await new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=TESSERACT_URL;tag.crossOrigin='anonymous';tag.onload=resolve;tag.onerror=()=>reject(new Error('โหลด Tesseract.js จาก CDN ไม่สำเร็จ'));document.head.append(tag);});}
 if(!window.Tesseract?.createWorker)throw new Error('Tesseract worker unavailable');
 worker=await window.Tesseract.createWorker('tha+eng',1,{});return worker;
}
async function detectLines(file){
 if(imageCanvas&&scannedFile===file&&ocrLines.length)return;
 stage='tesseract';say('กำลังอ่านภาพครั้งเดียวด้วย Tesseract เพื่อหาบรรทัดและตำแหน่ง…');
 imageCanvas=setImageCanvas(await loadImage(file));scannedFile=file;
 const w=await getWorker();const begin=performance.now();
 const out=await w.recognize(imageCanvas,{}, {text:true,blocks:true});
 tesseractMs=Math.round(performance.now()-begin);
 ocrLines=extractOCRLines(out.data.blocks).filter(l=>usableLineBox(l,imageCanvas.width,imageCanvas.height));
 if(!ocrLines.length)throw new Error('ไม่พบบรรทัดที่ตรวจสอบได้ ลองปิด Auto Crop หรือเปลี่ยนภาพ');
}
async function scriptRuntime(source){
 return new Promise((resolve,reject)=>{
  const tag=document.createElement('script');let done=false;
  const timer=setTimeout(()=>finish(new Error('runtime script timeout')),18000);
  function finish(err){if(done)return;done=true;clearTimeout(timer);tag.onload=null;tag.onerror=null;if(err){tag.remove();reject(err);}else resolve(window.ort);}
  tag.src=source.url;tag.crossOrigin='anonymous';tag.onload=()=>window.ort?.InferenceSession?.create?finish():finish(new Error('runtime exports missing'));tag.onerror=()=>finish(new Error('runtime network failure'));
  document.head.append(tag);
 });
}
async function getRuntime(){
 const attempts=runtimeSources(ORT_VERSION);
 runtimeAttempts=[];
 for(const s of attempts){
  say('กำลังโหลด ONNX Runtime Web: '+s.label);
  try{
   const runtime=s.kind==='classic'?await scriptRuntime(s):await import(s.url);
   if(!runtime?.InferenceSession?.create||!runtime?.Tensor)throw new Error('ONNX Runtime incomplete');
   runtimeAttempts.push({label:s.label,result:'ok'});
   return {runtime,wasmBase:s.wasmBase};
  }catch(_){runtimeAttempts.push({label:s.label,result:'failed'});}
 }
 throw new Error('ไม่สามารถโหลด ONNX Runtime จากแหล่งสำรองได้');
}
async function fetchBytes(url,label){
 say('กำลังโหลด '+label+' (ดาวน์โหลดโมเดล ไม่อัปโหลดภาพ)…');
 const response=await fetch(url,{credentials:'omit',mode:'cors'});
 if(!response.ok)throw new Error(label+' HTTP '+response.status);
 return response.arrayBuffer();
}
async function loadOpenThai(){
 if(onnx)return;
 const begin=performance.now();stage='runtime-load';const source=await getRuntime();
 ort=source.runtime;ort.env.wasm.wasmPaths=source.wasmBase;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 stage='model-fetch';
 const [modelBytes,dictBytes]=await Promise.all([fetchBytes(MODEL_PATH,'rec.onnx'),fetchBytes(DICTIONARY_PATH,'พจนานุกรม OpenThai')]);
 dictionary=parseDictionary(new TextDecoder().decode(dictBytes));
 if(dictionary.length<100||dictionary.length>2000)throw new Error('พจนานุกรม OpenThai ไม่ตรงรูปแบบ');
 stage='session-create';say('กำลังสร้าง OpenThai ONNX Session บน iPhone…');
 onnx=await ort.InferenceSession.create(new Uint8Array(modelBytes),{executionProviders:['wasm'],graphOptimizationLevel:'all',enableMemPattern:false,enableCpuMemArena:false});
 if(!onnx.inputNames?.length||!onnx.outputNames?.length)throw new Error('ONNX ไม่มีชื่อ input/output');
 modelLoadMs=Math.round(performance.now()-begin);
}
function lineTensor(line){
 const b=line.bbox,padX=4,padY=4;
 const x0=Math.max(0,Math.floor(b.x0)-padX),y0=Math.max(0,Math.floor(b.y0)-padY);
 const x1=Math.min(imageCanvas.width,Math.ceil(b.x1)+padX),y1=Math.min(imageCanvas.height,Math.ceil(b.y1)+padY);
 const {width,height,drawWidth}=recognitionSize(x1-x0,y1-y0);
 const c=document.createElement('canvas');c.width=width;c.height=height;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#777';ctx.fillRect(0,0,width,height);
 ctx.drawImage(imageCanvas,x0,y0,x1-x0,y1-y0,0,0,drawWidth,height);
 return recognitionTensorFromRGBA(ctx.getImageData(0,0,width,height).data,width,height,drawWidth,{invert:$('invert').checked,channelOrder:$('channels').value});
}
async function recognizeOne(line){
 const {data,dims}=lineTensor(line);
 const before=performance.now();
 const result=await onnx.run({[onnx.inputNames[0]]:new ort.Tensor('float32',data,dims)});
 const took=Math.round(performance.now()-before);
 const output=result[onnx.outputNames[0]];
 if(!output)throw new Error('ไม่มี ONNX output');
 const text=greedyCTC(output.data,output.dims,dictionary).text;
 output.dispose?.();
 return {text,took};
}
function originalPreview(line){
 const b=line.bbox;const padX=5,padY=5;
 const x0=Math.max(0,Math.floor(b.x0)-padX),y0=Math.max(0,Math.floor(b.y0)-padY);
 const x1=Math.min(imageCanvas.width,Math.ceil(b.x1)+padX),y1=Math.min(imageCanvas.height,Math.ceil(b.y1)+padY);
 const scale=Math.min(1,760/(x1-x0));const c=document.createElement('canvas');c.className='original';
 c.width=Math.max(1,Math.round((x1-x0)*scale));c.height=Math.max(1,Math.round((y1-y0)*scale));
 c.getContext('2d').drawImage(imageCanvas,x0,y0,x1-x0,y1-y0,0,0,c.width,c.height);
 return c;
}
function markedBox(chunks){const e=document.createElement('div');e.className='recognized';for(const chunk of chunks){const el=document.createElement(chunk.changed?'mark':'span');if(chunk.changed)el.className='changed';el.textContent=chunk.text;e.append(el);}return e;}
function buildRow(item){
 const outer=document.createElement('article');outer.className='result-row';outer.dataset.index=String(item.index);
 const header=document.createElement('div');header.className='row-head';const title=document.createElement('strong');title.textContent=`บรรทัด ${item.index+1}`;
 const badge=document.createElement('span');badge.className='tag';badge.textContent='กำลังรอ OpenThai';header.append(title,badge);
 const preview=originalPreview(item.line);preview.setAttribute('aria-label','บริเวณภาพต้นฉบับของบรรทัดนี้');
 const pair=document.createElement('div');pair.className='pair';
 const left=document.createElement('div'),right=document.createElement('div');
 const leftLabel=document.createElement('div');leftLabel.className='pair-title';leftLabel.textContent='Tesseract';
 const rightLabel=document.createElement('div');rightLabel.className='pair-title';rightLabel.textContent='OpenThai ONNX';
 const baseline=markedBox([{text:item.baseline,changed:false}]);const candidate=markedBox([{text:'ยังไม่ได้อ่าน',changed:false}]);
 left.append(leftLabel,baseline);right.append(rightLabel,candidate);pair.append(left,right);
 const truthWrap=document.createElement('div');truthWrap.className='truth';const label=document.createElement('label');label.textContent='ข้อความเฉลยจากภาพ (ไม่บังคับ)';label.htmlFor='truth-'+item.index;
 const input=document.createElement('textarea');input.id=label.htmlFor;input.rows=2;input.placeholder='พิมพ์เฉพาะข้อความจริงในบรรทัดนี้เพื่อวัด CER';input.spellcheck=false;
 const score=document.createElement('div');score.className='score';input.addEventListener('input',()=>{item.truth=input.value;refreshAccuracy();});truthWrap.append(label,input,score);
 outer.append(header,preview,pair,truthWrap);item.dom={badge,baseline,candidate,score};return outer;
}
function updateRow(item){
 if(item.error){item.dom.badge.className='tag fail';item.dom.badge.textContent='OpenThai อ่านไม่สำเร็จ';item.dom.candidate.textContent='ไม่สำเร็จ (ไม่นับเป็นผล OCR)';return;}
 if(item.candidate===null)return;
 const runs=compareRuns(item.baseline,item.candidate);
 item.dom.baseline.replaceWith(markedBox(runs.left));item.dom.candidate.replaceWith(markedBox(runs.right));
 item.dom.badge.className='tag '+(runs.identical?'same':'diff');item.dom.badge.textContent=runs.identical?'ข้อความตรงกัน':'ข้อความต่างกัน';
}
function counts(){const done=items.filter(x=>x.candidate!==null&&!x.error);return {done,identical:done.filter(x=>compareRuns(x.baseline,x.candidate).identical).length,different:done.filter(x=>!compareRuns(x.baseline,x.candidate).identical).length,failures:items.filter(x=>x.error).length};}
function refreshAccuracy(){
 const matched=items.filter(x=>x.truth.trim()&&x.candidate!==null&&!x.error);
 for(const item of items){if(!item.dom)return;const truth=item.truth.trim();const a=truth?evaluateText(truth,item.baseline):null;const b=truth&&item.candidate!==null&&!item.error?evaluateText(truth,item.candidate):null;
  item.dom.score.textContent=!truth?'':`CER ไม่คิดช่องว่าง: Tesseract ${(a.compactCer*100).toFixed(1)}% · OpenThai ${b?(b.compactCer*100).toFixed(1)+'%':'ยังไม่อ่าน'}`;
 }
 const acc=$('accuracy');if(!matched.length){acc.textContent='ยังไม่มีข้อความเฉลย · “ตรงกัน” แปลว่าผลสองโมเดลเหมือนกัน ไม่ได้แปลว่าอ่านถูก';return;}
 const a=evaluateAlignedSamples(matched.map(x=>({id:x.index,reference:x.truth,recognized:x.baseline}))).summary;
 const b=evaluateAlignedSamples(matched.map(x=>({id:x.index,reference:x.truth,recognized:x.candidate}))).summary;
 acc.textContent=`เฉพาะ ${matched.length} บรรทัดที่มีเฉลยและ OpenThai อ่านสำเร็จ: CER ไม่คิดช่องว่าง — Tesseract ${(a.compactCer*100).toFixed(1)}% · OpenThai ${(b.compactCer*100).toFixed(1)}% (น้อยกว่าดีกว่า)`;
}
function refreshStats(){
 const {done,identical,different,failures}=counts();const stats=$('stats');stats.replaceChildren(
 makeStat('พบทั้งหมด',ocrLines.length+' บรรทัด'),makeStat('เลือกทดสอบ',items.length+' บรรทัด'),
 makeStat('OpenThai สำเร็จ',done.length+' บรรทัด'),makeStat('ผลเหมือนกัน / ต่างกัน',identical+' / '+different),
 makeStat('Tesseract ทั้งภาพ',tesseractMs+' ms'),makeStat('OpenThai รวมเฉพาะ inference',totalInferenceMs+' ms'),
 makeStat('โหลดโมเดลครั้งแรก',modelLoadMs+' ms'),makeStat('อ่านไม่สำเร็จ',failures+' บรรทัด'));
 refreshAccuracy();
 $('copy-safe').disabled=!items.length;
 $('copy-text').disabled=!items.length;
}
function safeReport(){const c=counts();return safeBatchReport({detected:ocrLines.length,selected:items.length,completed:c.done.length,identical:c.identical,different:c.different,failures:c.failures,cancelled:wasCancelled,tesseractMs,modelLoadMs,inferenceMs:totalInferenceMs,withTruth:items.filter(x=>x.truth.trim()).length});}
function transcriptReport(){
 return ['ChatLens Phase C — local side-by-side comparison',`Tesseract full screenshot ${tesseractMs} ms; OpenThai model load ${modelLoadMs} ms; sum inference ${totalInferenceMs} ms`,...items.map(item=>`\n# Line ${item.index+1}\nTesseract: ${item.baseline}\nOpenThai: ${item.error?'[ERROR]':item.candidate??'[NOT RUN]'}${item.truth.trim()?`\nGround truth: ${item.truth}`:''}`)].join('\n');
}
async function copyOrShow(text){
 try{await navigator.clipboard.writeText(text);say('✓ คัดลอกแล้ว');}
 catch(_){$('fallback').hidden=false;$('fallback-text').value=text;$('fallback-text').focus();$('fallback-text').select();say('คัดลอกอัตโนมัติไม่สำเร็จ เลือกข้อความจากกล่องด้านล่างได้เลย');}
}
async function run(){
 if(busy)return;const file=$('photo').files?.[0];if(!file){say('เลือกภาพ Discord ก่อนจ้า');return;}
 toggleBusy(true);stopRequested=false;wasCancelled=false;items=[];totalInferenceMs=0;
 $('report').hidden=true;$('results').replaceChildren();$('fallback').hidden=true;$('copy-safe').disabled=true;$('progress').value=0;
 try{
  await detectLines(file);
  const selected=chooseBatchLines(ocrLines,$('scope').value);
  if(!selected.length)throw new Error('ไม่พบบรรทัดตามตัวกรอง ลองเลือก “ทุกบรรทัด”');
  items=selected.map(({line,index})=>({line,index,baseline:line.text,candidate:null,error:null,truth:'',dom:null}));
  $('progress').max=items.length;$('report').hidden=false;
  for(const item of items){$('results').append(buildRow(item));}refreshStats();
  if(stopRequested){wasCancelled=true;return;}
  await loadOpenThai();stage='inference';
  for(let i=0;i<items.length;i++){
   if(stopRequested){wasCancelled=true;break;}
   const item=items[i];say(`กำลังให้ OpenThai อ่านบรรทัด ${i+1}/${items.length} (ทำทีละบรรทัดเพื่อลดภาระ Safari)`);
   try{const result=await recognizeOne(item.line);item.candidate=result.text;totalInferenceMs+=result.took;}
   catch(err){item.error=true;const safe=diagnosticReport({stage:'inference',version:ORT_VERSION,attempts:runtimeAttempts,error:err});console.warn('Batch line inference failed; redacted: '+safe.split('\n').slice(-3).join(' | '));}
   updateRow(item);$('progress').value=i+1;refreshStats();
   // Yield after each line so Safari can paint progress and handle cancel.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  const c=counts();say(wasCancelled?`หยุดแล้ว · OpenThai สำเร็จ ${c.done.length}/${items.length} บรรทัด`:`✓ เปรียบเทียบเสร็จ ${c.done.length}/${items.length} บรรทัด · ผลเหมือนกัน ${c.identical} / ต่างกัน ${c.different} · ยังต้องดูภาพเฉลยเพื่อตัดสินความแม่น`);
 }catch(err){
  const safe=diagnosticReport({stage,version:ORT_VERSION,attempts:runtimeAttempts,error:err});
  say('⚠️ การทดลองไม่สำเร็จในขั้น '+stage+'\n'+safe+'\nข้อความแชทไม่ได้ถูกส่งออกจากเครื่อง');
 }finally{toggleBusy(false);refreshStats();}
}
$('start').addEventListener('click',run);
$('stop').addEventListener('click',()=>{stopRequested=true;$('stop').disabled=true;say('รับคำสั่งหยุดแล้ว · จะหยุดหลังบรรทัดปัจจุบัน (ไม่สามารถตัด ONNX ระหว่าง inference ได้)');});
$('photo').addEventListener('change',()=>{imageCanvas=null;scannedFile=null;ocrLines=[];items=[];$('report').hidden=true;$('results').replaceChildren();$('copy-safe').disabled=true;});
$('crop').addEventListener('change',()=>{imageCanvas=null;scannedFile=null;ocrLines=[];});
$('copy-safe').addEventListener('click',()=>copyOrShow(safeReport()));
$('copy-text').addEventListener('click',()=>copyOrShow(transcriptReport()));
window.addEventListener('pagehide',()=>{try{worker?.terminate();onnx?.release();}catch(_){}});
