import {discordCropRect} from '../lib/scan-utils.mjs';
import {extractOCRLines} from '../lib/discord-structure.mjs';
import {evaluateText} from './metrics.mjs';
import {
  MODEL_PATH,DICTIONARY_PATH,ORT_VERSION,ORT_BASE,OPEN_THAI_REVISION,
  recognitionSize,recognitionTensorFromRGBA,greedyCTC,parseDictionary,usableLineBox
} from './openthai-core.mjs';

const $=id=>document.getElementById(id);
const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let original=null,canvas=null,lines=[],worker=null,model=null,ort=null,dictionary=null;
let selectedText='',candidateText='',selectedLine=null,tesseractMs=0,modelLoadMs=0,recognitionMs=0;
let loading=false;
function status(msg){$('progress').textContent=msg;}
function isLive(){return !loading;}
function startBusy(){loading=true;$('choose').disabled=true;$('recognize').disabled=true;$('photo').disabled=true;}
function stopBusy() {loading=false;$('photo').disabled=false;$('choose').disabled=!(canvas&&lines.length);$('recognize').disabled=!(canvas&&selectedLine);}
function clearModelResults(){candidateText='';selectedText='';$('openthai').value='';$('baseline').value='';$('score').textContent='';$('copy').disabled=true;}

async function readImage(file){
 const url=URL.createObjectURL(file);
 try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('ไม่สามารถเปิดรูปได้'));image.src=url;});return image;}
 finally { /* image decoded by browser, revoke at next animation frame */ setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
function makeCanvas(image){
 const crop=discordCropRect(image.naturalWidth,image.naturalHeight,$('crop').checked);
 const scale=Math.min(1,1500/crop.width),cnv=document.createElement('canvas');
 cnv.width=Math.round(crop.width*scale);cnv.height=Math.round(crop.height*scale);
 cnv.getContext('2d',{willReadFrequently:true}).drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,cnv.width,cnv.height);
 return cnv;
}
async function getTesseract(){
 if(worker)return worker;
 if(!window.Tesseract){
  await new Promise((resolve,reject)=>{
   const tag=document.createElement('script');tag.src=TESSERACT_URL;tag.crossOrigin='anonymous';
   tag.onload=resolve;tag.onerror=()=>reject(new Error('Tesseract CDN โหลดไม่ได้'));
   document.head.append(tag);
  });
 }
 if(!window.Tesseract?.createWorker)throw new Error('ไม่พบ Tesseract.createWorker');
 worker=await window.Tesseract.createWorker('tha+eng',1,{});
 return worker;
}
function paintSelected(){
 const c=$('view');const maxWidth=760,factor=Math.min(1,maxWidth/canvas.width);
 c.width=Math.round(canvas.width*factor);c.height=Math.round(canvas.height*factor);
 const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,c.width,c.height);
 if(selectedLine){const b=selectedLine.bbox;ctx.lineWidth=2;ctx.strokeStyle='#ffbf64';ctx.strokeRect(b.x0*factor,b.y0*factor,(b.x1-b.x0)*factor,(b.y1-b.y0)*factor);}
}
function selectLine(index){
 selectedLine=lines[index]||null;candidateText='';selectedText=selectedLine?.text||'';
 $('baseline').value=selectedText;$('openthai').value='';$('score').textContent='';$('recognize').disabled=!selectedLine;
 $('copy').disabled=true;paintSelected();
}
async function scan(){
 if(!isLive())return;
 const file=$('photo').files?.[0];if(!file){status('เลือกภาพก่อนจ้า');return;}
 startBusy();clearModelResults();lines=[];selectedLine=null;$('line').replaceChildren();$('recognize').disabled=true;
 try{
  status('กำลังเปิดภาพและอ่านข้อความด้วย Tesseract เพื่อหาตำแหน่งบรรทัด...');
  original=await readImage(file);canvas=makeCanvas(original);
  const tess=await getTesseract();const start=performance.now();
  const result=await tess.recognize(canvas,{}, {text:true,blocks:true});
  tesseractMs=Math.round(performance.now()-start);
  lines=extractOCRLines(result.data.blocks).filter(l=>usableLineBox(l,canvas.width,canvas.height));
  if(!lines.length)throw new Error('ยังตรวจหากล่องบรรทัดไม่ได้ โปรดลองภาพอื่น หรือปิด Auto Crop');
  for(let i=0;i<lines.length;i++){
    const opt=document.createElement('option');opt.value=String(i);opt.textContent=`${i+1}. ${lines[i].text.slice(0,70)}`;$('line').append(opt);
  }
  $('choose').disabled=false;selectLine(0);
  $('extract').textContent=`พบ ${lines.length} บรรทัด · Tesseract ${tesseractMs} ms · เลือกบรรทัดแล้วทดลอง OpenThai`;status('✓ อ่านกล่องบรรทัดแล้ว เลือกข้อความที่อยากเทียบ');
 }catch(err){status('❌ '+String(err?.message||err));$('extract').textContent='ยังไม่มีผล';}finally{stopBusy();}
}
async function fetchArray(url,label){
 status('กำลังโหลด '+label+'… (เป็นไฟล์โมเดล ไม่ใช่การส่งภาพออก)');
 const response=await fetch(url,{mode:'cors',credentials:'omit'});
 if(!response.ok)throw new Error(`${label} HTTP ${response.status}; แหล่งโมเดลอาจไม่พร้อมใช้งานบน Safari`);
 return response.arrayBuffer();
}
async function loadModel(){
 if(model)return;
 const begin=performance.now();
 status('กำลังโหลด ONNX Runtime Web...');
 ort=await import(`${ORT_BASE}esm/ort.min.js`);
 ort.env.wasm.wasmPaths=ORT_BASE;
 ort.env.wasm.numThreads=1;
 ort.env.wasm.proxy=false;
 const [modelBytes,dictBytes]=await Promise.all([fetchArray(MODEL_PATH,'OpenThai rec.onnx'),fetchArray(DICTIONARY_PATH,'OpenThai dictionary')]);
 dictionary=parseDictionary(new TextDecoder().decode(dictBytes));
 if(dictionary.length<100||dictionary.length>2000)throw new Error('พจนานุกรมมีจำนวนอักขระผิดปกติ');
 status('กำลังสร้าง ONNX Session บนเครื่อง...');
 model=await ort.InferenceSession.create(new Uint8Array(modelBytes),{executionProviders:['wasm'],graphOptimizationLevel:'all',enableMemPattern:false,enableCpuMemArena:false});
 if(!model?.inputNames?.length||!model?.outputNames?.length)throw new Error('ONNX Session ไม่คืนชื่ออินพุต/เอาต์พุต');
 modelLoadMs=Math.round(performance.now()-begin);
}
function cropLineIntoTensor(){
 const b=selectedLine.bbox;
 const padX=4,padY=4;
 const x0=Math.max(0,Math.floor(b.x0)-padX),y0=Math.max(0,Math.floor(b.y0)-padY);
 const x1=Math.min(canvas.width,Math.ceil(b.x1)+padX),y1=Math.min(canvas.height,Math.ceil(b.y1)+padY);
 const w=x1-x0,h=y1-y0;
 const {width,height,drawWidth}=recognitionSize(w,h);
 const stage=document.createElement('canvas');stage.width=width;stage.height=height;
 const ctx=stage.getContext('2d',{willReadFrequently:true});
 ctx.fillStyle='#777';ctx.fillRect(0,0,width,height); // padding is normalized 0; image region overwritten below.
 ctx.drawImage(canvas,x0,y0,w,h,0,0,drawWidth,height);
 const rgba=ctx.getImageData(0,0,width,height).data;
 return recognitionTensorFromRGBA(rgba,width,height,drawWidth,{invert:$('invert').checked,channelOrder:$('channels').value});
}
async function runOpenThai(){
 if(loading||!selectedLine)return;
 startBusy();
 try{
  await loadModel();
  status('กำลังอ่านบรรทัดที่เลือกด้วย OpenThai ONNX...');
  const {data,dims}=cropLineIntoTensor();
  const before=performance.now();
  const input=new ort.Tensor('float32',data,dims);
  const result=await model.run({[model.inputNames[0]]:input});
  recognitionMs=Math.round(performance.now()-before);
  const output=result[model.outputNames[0]];
  if(!output)throw new Error('ONNX ไม่มีเอาต์พุตที่คาดไว้');
  const decoded=greedyCTC(output.data,output.dims,dictionary);
  candidateText=decoded.text;$('openthai').value=candidateText;
  $('copy').disabled=false;
  $('extract').textContent=`Tesseract ${tesseractMs} ms (ภาพรวม) · โหลด OpenThai ${modelLoadMs} ms · OpenThai ${recognitionMs} ms (1 บรรทัด) · ${decoded.steps} time steps`;
  evaluate();status('✓ ONNX รันได้บนเบราว์เซอร์นี้ (เป็นแค่ recognizer บรรทัดเดียว ไม่ใช่ OpenThai เต็มระบบ)');
 }catch(err){candidateText='';$('copy').disabled=true;status('⚠️ OpenThai ยังรันไม่ได้: '+String(err?.message||err));}
 finally {stopBusy();}
}
function evaluate(){
 const truth=$('truth').value.trim();
 if(!truth){$('score').textContent='ยังไม่มีข้อความเฉลย · อ่านผลด้วยตาได้ แต่ยังวัด CER ไม่ได้';return;}
 const a=evaluateText(truth,selectedText),b=candidateText?evaluateText(truth,candidateText):null;
 const pct=r=>r?(r.compactCer*100).toFixed(1)+'%':'ยังไม่มีผล';
 $('score').textContent=`CER ไม่คิดช่องว่าง · Tesseract ${pct(a)} · OpenThai ${pct(b)} · เทียบเฉพาะบรรทัดที่เลือก ไม่ใช่ทั้งภาพ`;
}
$('choose').addEventListener('click',scan);
$('line').addEventListener('change',()=>selectLine(Number($('line').value)));
$('recognize').addEventListener('click',runOpenThai);
$('truth').addEventListener('input',evaluate);
$('copy').addEventListener('click',async()=>{
 const summary=[
 'ChatLens OpenThai 2.1 line recognizer proof (not production OCR)',
 `OpenThai version: ${OPEN_THAI_REVISION} · ONNX Runtime Web ${ORT_VERSION}`,
 `Tesseract full image ${tesseractMs} ms; OpenThai model load ${modelLoadMs} ms; one line inference ${recognitionMs} ms`,
 `Source line index ${Number($('line').value)+1}/${lines.length}`,
 `OpenThai inference: ${candidateText?'completed':'not completed'}`,
 $('score').textContent,
 'No screenshot, filename, usernames or recognized text included in this summary.'
 ].join('\n');
 try{await navigator.clipboard.writeText(summary);status('✓ คัดลอกสรุปสถานะแล้ว (ไม่รวมข้อความแชท)');}
 catch(_){status('คัดลอกอัตโนมัติไม่ได้ แคปผลหรือคัดลอกจากช่องข้อความเองได้จ้า');}
});
window.addEventListener('pagehide',()=>{try{worker?.terminate();model?.release();}catch(_){}});
