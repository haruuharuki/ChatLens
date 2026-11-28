import {conversationCrop,refineSemanticRows,hasMentionBackground} from './d4-layout.mjs?v=d5a';
import {identicalNamePixels,resolveNameEvidence} from './name-evidence.mjs?v=d4';
import {trailingBitmap} from './graphic-edge.mjs?v=d4';
import {redundantSplit,tightenRecovery,classifyStructure,isolateNameBox,needsAlternateReading,alternateMatches} from './region-plan.mjs?v=d4';
import {inferTextColumn,safeTextLeft,allowVerticalBand} from './smart-region.mjs?v=d2c12';
import {benchmarkCropRect} from './safe-crop.mjs?v=d4';
import {extractOCRLines} from '../lib/discord-structure.mjs';
import {evaluateAlignedSamples,evaluateText} from './metrics.mjs';
import {chooseBatchLines,compareRuns,safeBatchReport} from './batch-core.mjs?v=d1c';
import {MODEL_PATH,DICTIONARY_PATH,ORT_VERSION,OPEN_THAI_REVISION,recognitionSize,recognitionTensorFromRGBA,greedyCTC,parseDictionary,usableLineBox} from './openthai-core.mjs';
import {runtimeSources,diagnosticReport} from './runtime-loader.mjs';
import {classifyDiscordLine,coloredNameFraction,cleanBodyLineRGBA} from './line-guard.mjs?v=d1c';
import {isolateBodyLayoutRGBA,referenceHasArtworkNotes} from './layout-guard.mjs';
import {auditDetectedRegion,extendTextRight} from './region-audit.mjs?v=d1c';
import {maskNonTextColors} from './text-color-mask.mjs';
import {assembleTextTranscript,formatTextTranscript,parseHeader} from './text-transcript.mjs?v=d5a';
import {discoverHeaderBands,splitBoxesAtHeaders,combineRecognizedHeader} from './header-layout.mjs?v=d4';

import {parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
const $=id=>document.getElementById(id);
const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let imageCanvas=null,ocrLines=[],scannedFile=null,worker=null,onnx=null,ort=null,dictionary=null;
let modelLoadMs=0,tesseractMs=0,tesseractLineMs=0,totalInferenceMs=0;
let items=[],busy=false,stopRequested=false,wasCancelled=false,runtimeAttempts=[],stage='idle';
let cropApplied=false,reviewReady=false,reviewSelection=new Set(),imagePixels=null;
let transcriptEdited=false, textColumn=null, lastNameResolutions=[];
function say(text){$('status').textContent=text;}
function toggleBusy(on){busy=on;$('start').disabled=on;$('photo').disabled=on;$('scope').disabled=on;$('crop').disabled=on;$('channels').disabled=on;$('invert').disabled=on;$('focus-body').disabled=on;$('layout-focus').disabled=on;$('extend-text').disabled=on;$('layout-headers').disabled=on;$('text-only').disabled=on;$('review').disabled=on;$('stop').disabled=!on;$('stop').hidden=!on;}
function makeStat(label,value){const e=document.createElement('div');e.className='stat';const name=document.createElement('small');name.textContent=label;const strong=document.createElement('strong');strong.textContent=value;e.append(name,strong);return e;}
function setImageCanvas(image){
 const source=document.createElement('canvas');const ratio=Math.min(1,1500/image.naturalWidth,3600/image.naturalHeight);
 source.width=Math.max(1,Math.round(image.naturalWidth*ratio));source.height=Math.max(1,Math.round(image.naturalHeight*ratio));
 const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,source.width,source.height);
 const detected=$('crop').checked?conversationCrop(ctx.getImageData(0,0,source.width,source.height).data,source.width,source.height):benchmarkCropRect(source.width,source.height,false);
 const x=Math.floor(detected.x*image.naturalWidth/source.width),y=Math.floor(detected.y*image.naturalHeight/source.height),bottom=Math.ceil((detected.y+detected.height)*image.naturalHeight/source.height);
 const crop={x,y,width:image.naturalWidth-x,height:bottom-y,cropped:detected.cropped};source.width=1;source.height=1;
 cropApplied=crop.cropped;
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
 imageCanvas=setImageCanvas(await loadImage(file));scannedFile=file;textColumn=null;lastNameResolutions=[];
 const w=await getWorker();const begin=performance.now();
 const out=await w.recognize(imageCanvas,{}, {text:true,blocks:true});
 tesseractMs=Math.round(performance.now()-begin);
  const pixels=imageCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,imageCanvas.width,imageCanvas.height).data;
  imagePixels=pixels;
 ocrLines=extractOCRLines(out.data.blocks).filter(l=>usableLineBox(l,imageCanvas.width,imageCanvas.height)).map(l=>{
  const coloredFraction=coloredNameFraction(pixels,imageCanvas.width,imageCanvas.height,l.bbox);
  const type=classifyDiscordLine(l,{coloredFraction});
  return {...l,kind:type.kind,reason:type.reason};
 });
  if(!ocrLines.length)throw new Error('ไม่พบบรรทัดที่ตรวจสอบได้ ลองปิด Auto Crop หรือเปลี่ยนภาพ');
  // Audit screenshot geometry after OCR: a Tesseract line is NOT necessarily a
  // Discord text line. Keep every region available for manual review.
  const heights=ocrLines.map(x=>x.bbox.y1-x.bbox.y0).filter(h=>h>=11&&h<=imageCanvas.height*.08).sort((a,b)=>a-b);
  const typicalHeight=heights.length?heights[Math.floor(heights.length*.5)]:0;
  ocrLines=ocrLines.map(line=>{const audit=auditDetectedRegion(line,pixels,imageCanvas.width,imageCanvas.height,{typicalHeight});return {...line,...audit};});
  textColumn=inferTextColumn(ocrLines,imageCanvas.width);
   ocrLines=classifyStructure(ocrLines,pixels,imageCanvas.width,imageCanvas.height,textColumn);
  ocrLines=refineSemanticRows(ocrLines,pixels,imageCanvas.width,imageCanvas.height,textColumn);
  // Phase D.1: use author-colored layout as an INDEPENDENT source of candidate
  // headers, not Tesseract's sometimes mixed header+body boxes. Re-OCR narrow
  // horizontal strips before building the transcript. Source image unchanged.
  const bands=$('layout-headers').checked?discoverHeaderBands(pixels,imageCanvas.width,imageCanvas.height,{leftFraction:cropApplied?.025:.07}):[];
  if(bands.length){
   const original=ocrLines;
   const accepted=[],headers=[],nameCache=[];
   for(const band of bands){
    const headerBox={x0:band.x0,y0:band.y0,x1:band.x1,y1:band.y1};
    const overlaps=original.filter(l=>Math.min(l.bbox.y1,band.y1)-Math.max(l.bbox.y0,band.y0)>=Math.min(12,(l.bbox.y1-l.bbox.y0)*.35));
    if(hasMentionBackground(headerBox,pixels,imageCanvas.width,imageCanvas.height,textColumn)||overlaps.some(l=>l.kind==='reply'||l.mention))continue;
    const nearbyLine=overlaps.filter(l=>['header','mixed'].includes(l.kind))
      .find(l=>parseDiscordTimestamp(String(l.text||'').replace(/\s+/g,' ').trim(),{allowBare24:true}));
    const nearby=nearbyLine?String(nearbyLine.text||'').replace(/\s+/g,' ').trim():'';
    const reread=await rereadRegion({bbox:headerBox},'header');
    if(!nearby&&!parseDiscordTimestamp(reread))continue;
    const nameBox={...headerBox,x1:Math.min(headerBox.x1,Math.max(headerBox.x0+24,band.nameEnd+12))};
    const tightName=isolateNameBox(headerBox,pixels,imageCanvas.width,imageCanvas.height,textColumn);
    const cached=tightName&&nameCache.find(n=>identicalNamePixels(n.box,tightName,pixels,imageCanvas.width,imageCanvas.height));
    const nameOnly=cached?cached.scaled:await rereadRegion({bbox:tightName||nameBox},'header',tightName?2:1);
    const native=cached?cached.native:tightName?await rereadRegion({bbox:tightName},'header',1):'';
    if(tightName&&!cached)nameCache.push({box:tightName,scaled:nameOnly,native});
    const {text,usedNameOnly}=combineRecognizedHeader({full:reread,nameOnly,nearby,trustedNameGeometry:Boolean(tightName)});
    if(!parseHeader(text,'header'))continue;
    accepted.push(band);
    headers.push({text,bbox:headerBox,headerTailBox:text===nearby?nearbyLine?.bbox:headerBox,kind:'header',reason:usedNameOnly?'แยกอ่านชื่อและเวลา':'ตรวจแถวชื่อจากตำแหน่งภาพ (ยังต้องตรวจชื่อ)',layoutHeader:true,nameROI:tightName||nameBox,nameEvidence:tightName?{full:reread,nearby,native,scaled:nameOnly,badge:tightName.badge}:null});
   }
   const separation=splitBoxesAtHeaders(original,accepted,imageCanvas.width);
   const improved=[...headers];
   for(const l of separation.lines){
    if(l.needsBodyRead){
     const wide={...l.bbox,x1:Math.min(imageCanvas.width,Math.max(l.bbox.x1,Math.round(imageCanvas.width*.95)))};
     const box=tightenRecovery(wide,pixels,imageCanvas.width,imageCanvas.height,textColumn);
     const primary=redundantSplit(l,separation.lines,pixels,imageCanvas.width,imageCanvas.height,textColumn);
     if(primary){
      improved.push({...l,bbox:box,kind:'covered',alternateBody:true,primaryBox:primary.bbox,needsBodyRead:false,reason:'กรอบสำรอง: อ่านเมื่อผลหลักไม่ตรงกัน หรือเลือกอ่านเอง'});continue;
     }
     const text=await rereadRegion({...l,bbox:box},'body');
     improved.push({...l,bbox:box,text,needsBodyRead:false});
    }else improved.push(l);
   }
   ocrLines=improved.sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
  }
  ocrLines=classifyStructure(ocrLines,pixels,imageCanvas.width,imageCanvas.height,textColumn);
  ocrLines=refineSemanticRows(ocrLines,pixels,imageCanvas.width,imageCanvas.height,textColumn);
  // Short names may not create a geometric header band. Keep its observed clock.
  if($('layout-headers').checked)for(const l of ocrLines){
   if(l.kind!=='mixed'||!l.bodyBand)continue;
   const head=parseHeader(l.text,'mixed');if(!head||head.tail)continue;
   const top={...l.bbox,y1:Math.min(l.bbox.y1,l.bbox.y0+l.bodyBand.top+8)};
   const nameROI=isolateNameBox(top,pixels,imageCanvas.width,imageCanvas.height,textColumn);if(!nameROI)continue;
   const nameOnly=await rereadRegion({bbox:nameROI},'header',2);
    const native=await rereadRegion({bbox:nameROI},'header',1);
    const full=l.text;
   const combined=combineRecognizedHeader({full:l.text,nameOnly,nearby:l.text,trustedNameGeometry:true});
   if(parseHeader(combined.text,'mixed')){l.text=combined.text;l.nameROI=nameROI;l.nameEvidence={full,nearby:full,native,scaled:nameOnly,badge:nameROI.badge};}
  }
}
/** Targeted second pass: geometry is known; never include pixels outside it. */
async function rereadRegion(line,kind,scale=1){
 const b=line.bbox,c=document.createElement('canvas');
 const x0=Math.max(0,Math.floor(b.x0)),y0=Math.max(0,Math.floor(b.y0));
 const sw=Math.max(1,Math.min(imageCanvas.width,Math.ceil(b.x1))-x0),sh=Math.max(1,Math.min(imageCanvas.height,Math.ceil(b.y1))-y0);
 c.width=sw*scale;c.height=sh*scale;
 c.getContext('2d',{willReadFrequently:true}).drawImage(imageCanvas,x0,y0,sw,sh,0,0,c.width,c.height);
 // Header is a full single Discord username row. Do NOT use body-only masks
 // on names: that previously erased colored username glyphs entirely.
 if(kind==='body'&&$('text-only').checked){
  const context=c.getContext('2d',{willReadFrequently:true}),im=context.getImageData(0,0,c.width,c.height);
  const filter=maskNonTextColors(im.data,c.width,c.height);im.data.set(filter.pixels);context.putImageData(im,0,0);
 }
 const o=await (await getWorker()).recognize(c);
 return String(o.data.text||'').replace(/\s+/g,' ').trim();
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
/** Experimental color-only mask, on disposable OCR crops; raw images are unchanged. */
function maybeTextOnly(canvas,metadata){
 if(!$('text-only').checked || metadata.graphic)return {canvas,...metadata};
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const image=ctx.getImageData(0,0,canvas.width,canvas.height);
 const filtered=maskNonTextColors(image.data,canvas.width,canvas.height);
 image.data.set(filtered.pixels);ctx.putImageData(image,0,0);
 return {canvas,...metadata,cleaned:true,textMask:true};
}

/** A single local line canvas is shared by BOTH engines in focused mode. */
function preparedLineCanvas(line){
 const b=line.bbox,padX=4,padY=4;
 const focus=$('focus-body').checked;
 const geometry=focus&&$('layout-focus').checked;
 const mixedBand=geometry&&line.kind==='mixed'&&line.bodyBand;
 const bodyTarget=mixedBand?{...b,y0:b.y0+line.bodyBand.top,y1:b.y0+line.bodyBand.bottom}:b;
 const expansion=geometry&&$('extend-text').checked&&['body','mixed'].includes(line.kind)&&imagePixels?
  extendTextRight(imagePixels,imageCanvas.width,imageCanvas.height,bodyTarget):null;
 const safeLeft=geometry&&line.kind==='body'?safeTextLeft(imagePixels,imageCanvas.width,imageCanvas.height,bodyTarget,textColumn):null;
 const x0=Math.max(0,Math.floor(bodyTarget.x0)-padX,safeLeft??0,line.textLeft??0),y0=Math.max(0,Math.floor(bodyTarget.y0)-padY);
 const bitmap=geometry&&['body','reply'].includes(line.kind)?trailingBitmap({...bodyTarget,x1:Math.min(imageCanvas.width,Math.ceil(expansion||bodyTarget.x1))},imagePixels,imageCanvas.width,imageCanvas.height,textColumn):null;
 const x1=Math.min(imageCanvas.width,line.textRight??bitmap?.cutX??Math.ceil(expansion||bodyTarget.x1)+padX),y1=Math.min(imageCanvas.height,Math.ceil(bodyTarget.y1)+padY);
 const c=document.createElement('canvas');c.width=Math.max(1,x1-x0);c.height=Math.max(1,y1-y0);
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(imageCanvas,x0,y0,c.width,c.height,0,0,c.width,c.height);
 // For headers, image-only regions and ambiguous fragments, show RAW pixels;
 // don't pretend that the image-cleanup heuristics understand their meaning.
 if(line.kind==='reply'&&(bitmap||line.textLeft))return {canvas:c,cleaned:true,layout:null,expansion:0,mixedBand:false,graphic:false,bitmap,preparedOrigin:{x:x0,y:y0}};
 if(line.mention)return {canvas:c,cleaned:true,layout:null,expansion:0,mixedBand:false,graphic:false,preparedOrigin:{x:x0,y:y0}};
 if(!focus||!['body','mixed'].includes(line.kind))return maybeTextOnly(c,{cleaned:Boolean(line.textLeft||line.textRight),layout:null,expansion:0,mixedBand:false,graphic:line.kind==='graphic'});
 const rgba=ctx.getImageData(0,0,c.width,c.height);
 const layout=geometry?isolateBodyLayoutRGBA(rgba.data,c.width,c.height,{absoluteX:x0,anchorX:null}):null;
 const cleaned=cleanBodyLineRGBA(layout?.pixels??rgba.data,c.width,c.height,{absoluteX:x0,canvasWidth:imageCanvas.width,enableAvatarGuard:false});
 rgba.data.set(cleaned.pixels);ctx.putImageData(rgba,0,0);
 const metadata={cleaned:true,layout,expansion:expansion?Math.max(0,Math.round(expansion-b.x1)):0,mixedBand:Boolean(mixedBand),smartLeft:safeLeft,bitmap,preparedOrigin:{x:x0,y:y0}};
 if(allowVerticalBand(line.kind,mixedBand)&&cleaned.band&&cleaned.band.bottom>cleaned.band.top){
  const out=document.createElement('canvas');out.width=c.width;out.height=cleaned.band.bottom-cleaned.band.top;
  out.getContext('2d').drawImage(c,0,cleaned.band.top,c.width,out.height,0,0,c.width,out.height);
  return maybeTextOnly(out,{...metadata,preparedOrigin:{x:x0,y:y0+cleaned.band.top}});
 }
 return maybeTextOnly(c,metadata);
}

function canvasTensor(c){
 const {width,height,drawWidth}=recognitionSize(c.width,c.height);
 const resized=document.createElement('canvas');resized.width=width;resized.height=height;
 const ctx=resized.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#777';ctx.fillRect(0,0,width,height);
 ctx.drawImage(c,0,0,c.width,c.height,0,0,drawWidth,height);
 return recognitionTensorFromRGBA(ctx.getImageData(0,0,width,height).data,width,height,drawWidth,{invert:$('invert').checked,channelOrder:$('channels').value});
}
async function recognizeOne(sourceCanvas){
 const {data,dims}=canvasTensor(sourceCanvas);
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
 const info=document.createElement('p');info.className='help';
  const kinds={body:'เนื้อหา',mixed:'ชื่อ/เวลา + เนื้อหา (รวมในกรอบเดียว)',graphic:'สงสัยเป็นรูปภาพ ไม่ใช่แชท',reply:'Reply preview',header:'หัวข้อความ/ชื่อ/ยศ',fragment:'ชิ้นส่วนที่อ่านไม่ครบ'};
 info.textContent=`ประเภทโดยประมาณ: ${kinds[item.line.kind]||'ไม่ทราบ'} — ${item.line.reason||'ยังไม่ยืนยัน'}`;
  if(item.prepared.mixedBand)info.textContent+=' · ส่งเฉพาะแถบเนื้อหาสีขาวเข้า OCR (ภาพชื่อ/เวลาอยู่ในต้นฉบับ)';
  if(item.prepared.expansion)info.textContent+=` · ขยายกรอบด้านขวา +${item.prepared.expansion}px (ทดลอง)`;
   if(item.prepared.textMask)info.textContent+=' · ใช้หน้ากากสีตัวอักษร (ทดลอง; อาจปิดสีตัวอักษรผิดได้)';
  if(item.line.kind==='graphic')info.textContent+=' · รูปภาพไม่ใช่ข้อความแชทตามปกติ หากตั้งใจทดสอบให้เลือกด้วยตนเอง';
  if(item.prepared.layout){
  const l=item.prepared.layout;
  if(l.leftCut||l.rightCut<l.width)info.textContent+=` · ทดลองปิดเศษภาพซ้าย ${l.leftCut}px / ขวา ${l.width-l.rightCut}px (ดูภาพครอปด้านล่าง)`;
 }
 const cleanedLabel=document.createElement('p');cleanedLabel.className='help';cleanedLabel.textContent=item.prepared.cleaned?'ภาพที่ให้ทั้งสอง OCR อ่าน (กรองสีตกแต่งแล้ว — ทดลอง)':'ภาพที่ให้ OpenThai อ่าน (ไม่มีการกรอง)';
 const preparedPreview=item.prepared.canvas;preparedPreview.className='original';
 preparedPreview.setAttribute('aria-label','ภาพที่ใช้จริงในการเปรียบเทียบ OCR');
 const pair=document.createElement('div');pair.className='pair';
 const left=document.createElement('div'),right=document.createElement('div');
 const leftLabel=document.createElement('div');leftLabel.className='pair-title';leftLabel.textContent='Tesseract';
 const rightLabel=document.createElement('div');rightLabel.className='pair-title';rightLabel.textContent='OpenThai ONNX';
 const baseline=markedBox([{text:item.baseline,changed:false}]);const candidate=markedBox([{text:'ยังไม่ได้อ่าน',changed:false}]);
 left.append(leftLabel,baseline);right.append(rightLabel,candidate);pair.append(left,right);
 const truthWrap=document.createElement('div');truthWrap.className='truth';const label=document.createElement('label');label.textContent='ข้อความเฉลยจากภาพ (ไม่บังคับ)';label.htmlFor='truth-'+item.index;
 const input=document.createElement('textarea');input.id=label.htmlFor;input.rows=2;input.placeholder='พิมพ์เฉพาะข้อความจริงในบรรทัดนี้เพื่อวัด CER';input.spellcheck=false;
 const score=document.createElement('div');score.className='score';input.addEventListener('input',()=>{item.truth=input.value;refreshAccuracy();refreshTranscript();});truthWrap.append(label,input,score);
 outer.append(header,info,preview,cleanedLabel,preparedPreview,pair,truthWrap);
 item.dom={badge,baseline,candidate,score};return outer;
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
 const matched=items.filter(x=>x.truth.trim()&&!referenceHasArtworkNotes(x.truth)&&x.candidate!==null&&!x.error);
 for(const item of items){if(!item.dom)return;const truth=item.truth.trim();
  if(referenceHasArtworkNotes(truth)){item.dom.score.textContent='⚠️ เฉลยมีคำอธิบายรูป/อีโมจิ จึงไม่คิด CER บรรทัดนี้ กรุณาใส่เฉพาะตัวอักษรจริง';continue;}
  const a=truth?evaluateText(truth,item.baseline):null;const b=truth&&item.candidate!==null&&!item.error?evaluateText(truth,item.candidate):null;
  item.dom.score.textContent=!truth?'':`CER ไม่คิดช่องว่าง: Tesseract ${(a.compactCer*100).toFixed(1)}% · OpenThai ${b?(b.compactCer*100).toFixed(1)+'%':'ยังไม่อ่าน'}`;
 }
 const acc=$('accuracy');if(!matched.length){acc.textContent='ยังไม่มีเฉลยตัวอักษรที่ใช้วัด CER ได้ · “ตรงกัน” แปลว่าผลสองโมเดลเหมือนกัน ไม่ได้แปลว่าอ่านถูก';return;}
 const a=evaluateAlignedSamples(matched.map(x=>({id:x.index,reference:x.truth,recognized:x.baseline}))).summary;
 const b=evaluateAlignedSamples(matched.map(x=>({id:x.index,reference:x.truth,recognized:x.candidate}))).summary;
 acc.textContent=`เฉพาะ ${matched.length} บรรทัดที่มีเฉลยและ OpenThai อ่านสำเร็จ: CER ไม่คิดช่องว่าง — Tesseract ${(a.compactCer*100).toFixed(1)}% · OpenThai ${(b.compactCer*100).toFixed(1)}% (น้อยกว่าดีกว่า)`;
}
function refreshTranscript(force=false){
 if(!ocrLines.length){$('transcript-panel').hidden=true;return;}
 if(transcriptEdited&&!force)return;
 const byIndex=new Map(items.map(item=>[item.index,item]));
 const rows=ocrLines.map((line,index)=>{
  const item=byIndex.get(index);
  return {...line,kind:line.alternateBody&&item?'body':line.kind,originalText:line.text,
   baseline:item?.baseline??line.text,
   candidate:item?.candidate??null,
   error:Boolean(item?.error),bulletRead:Boolean(line.bullet&&item?.candidate!==null&&item?.candidate!==undefined&&!item.error),bitmap:item?.prepared?.bitmap??null,truth:item?.truth??'',bodyOnly:line.kind==='mixed'?Boolean(item?.prepared?.mixedBand):true};
 });
 const resolved=resolveNameEvidence(rows,imagePixels,imageCanvas.width,imageCanvas.height);
 lastNameResolutions=resolved.map(r=>r.nameResolution??null);
 const result=assembleTextTranscript(resolved);
 $('transcript-text').value=formatTextTranscript(result);
 $('transcript-warning').textContent=[
  'เป็นร่างจากภาพเท่านั้น: OCR อาจอ่านชื่อ เวลา และเนื้อหาผิด และยังไม่ยืนยันว่าเก็บครบทั้งภาพ',
  ...result.warnings,
  `ข้อความไม่ทราบผู้พูด ${result.unknownCount} ช่วง · รูปภาพที่สงสัย ${result.graphicCount} กรอบ · รวมผลอ่านซ้ำจากพื้นที่เดียวกัน ${result.duplicateCount} รายการ`
 ].join(' · ');
 $('transcript-panel').hidden=false;
 transcriptEdited=false;
}
function refreshStats(){
 const {done,identical,different,failures}=counts();const stats=$('stats');stats.replaceChildren(
  makeStat('กรอบที่ OCR ตรวจพบ (ไม่ใช่จำนวนข้อความแชท)',ocrLines.length+' กรอบ'),
  makeStat('กรอบสำรองที่ยังไม่อ่าน',ocrLines.filter((x,i)=>x.alternateBody&&!items.some(item=>item.index===i)).length+' กรอบ'),
  makeStat('สงสัยเป็นภาพล้วน',ocrLines.filter(x=>x.kind==='graphic').length+' กรอบ'),
  makeStat('ชื่อกับเนื้อหารวมในกรอบเดียว',ocrLines.filter(x=>x.kind==='mixed').length+' กรอบ'),makeStat('เลือกทดสอบ',items.length+' บรรทัด'),makeStat('ยังไม่ได้เลือก (ทบทวนได้)',Math.max(0,ocrLines.length-reviewSelection.size)+' บรรทัด'),
 makeStat('OpenThai สำเร็จ',done.length+' บรรทัด'),makeStat('ผลเหมือนกัน / ต่างกัน',identical+' / '+different),
 makeStat('Tesseract ตรวจภาพ',tesseractMs+' ms'),makeStat('Tesseract อ่าน ROI เพิ่ม',tesseractLineMs+' ms'),makeStat('OpenThai รวมเฉพาะ inference',totalInferenceMs+' ms'),
 makeStat('โหลดโมเดลครั้งแรก',modelLoadMs+' ms'),makeStat('อ่านไม่สำเร็จ',failures+' บรรทัด'));
 refreshAccuracy();
 $('copy-safe').disabled=!items.length;
 $('copy-text').disabled=!items.length;
}
function safeReport(){const c=counts();return safeBatchReport({detected:ocrLines.length,selected:items.length,completed:c.done.length,identical:c.identical,different:c.different,failures:c.failures,cancelled:wasCancelled,tesseractMs,modelLoadMs,inferenceMs:totalInferenceMs,withTruth:items.filter(x=>x.truth.trim()&&!referenceHasArtworkNotes(x.truth)).length,tesseractLineMs,flaggedNonBody:ocrLines.filter(x=>x.kind!=='body').length});}
function transcriptReport(){
 return ['ChatLens D.5a — local side-by-side comparison',`Tesseract full screenshot ${tesseractMs} ms; OpenThai model load ${modelLoadMs} ms; sum inference ${totalInferenceMs} ms`,`Text column: ${JSON.stringify(textColumn)}`,`Backup regions: ${JSON.stringify(ocrLines.map((l,i)=>l.alternateBody?{line:i+1,box:l.bbox}:null).filter(Boolean))}`, ...items.map(item=>`\n# Line ${item.index+1}\nKind: ${item.line.kind}; splitBody: ${Boolean(item.line.splitBody)}; layoutHeader: ${Boolean(item.line.layoutHeader)}\nName resolution: ${JSON.stringify(lastNameResolutions[item.index]??null)}\nName evidence: ${JSON.stringify(item.line.nameEvidence??null)}\nName ROI: ${JSON.stringify(item.line.nameROI??null)}; replyContinuation: ${Boolean(item.line.replyContinuation)}\nSource box: ${JSON.stringify(item.line.sourceBodyBox??item.line.bbox)}\nROI box: ${JSON.stringify(item.line.bbox)}; prepared: ${item.prepared.canvas.width}x${item.prepared.canvas.height}; origin: ${JSON.stringify(item.prepared.preparedOrigin??null)}; semantic: ${JSON.stringify({bullet:!!item.line.bullet,mention:!!item.line.mention,edited:!!item.line.edited,paragraph:!!item.line.paragraphBefore,textLeft:item.line.textLeft??null,textRight:item.line.textRight??null})}; smartLeft: ${item.prepared.smartLeft??"none"}; trailingBitmap: ${JSON.stringify(item.prepared.bitmap??null)}\nOriginal: ${item.rawBaseline}\nTesseract: ${item.baseline}\nOpenThai: ${item.error?'[ERROR]':item.candidate??'[NOT RUN]'}${item.truth.trim()?`\nGround truth: ${item.truth}`:''}`)].join('\n');
}
async function copyOrShow(text){
 try{await navigator.clipboard.writeText(text);say('✓ คัดลอกแล้ว');}
 catch(_){$('fallback').hidden=false;$('fallback-text').value=text;$('fallback-text').focus();$('fallback-text').select();say('คัดลอกอัตโนมัติไม่สำเร็จ เลือกข้อความจากกล่องด้านล่างได้เลย');}
}
/** Reviews ALL detected OCR rows locally, including short speech and replies. */
function clearReview(){
 reviewReady=false;reviewSelection=new Set();
 $('review-panel').hidden=true;$('review-lines').replaceChildren();$('review-summary').textContent='ยังไม่ได้ตรวจบรรทัด';
}
function updateReviewSummary(){
  $('review-summary').textContent=`ตรวจพบ ${ocrLines.length} กรอบ (ไม่ใช่จำนวนแชท) · เลือกอ่าน ${reviewSelection.size} · สงสัยภาพล้วน ${ocrLines.filter(x=>x.kind==='graphic').length} · ยังไม่ได้เลือก ${ocrLines.length-reviewSelection.size}`;
}
function defaultReviewSelection(){
 reviewSelection=new Set(chooseBatchLines(ocrLines,$('scope').value).map(x=>x.index));
 reviewReady=true;
}
function renderReview(){
 const host=$('review-lines');host.replaceChildren();
  const kinds={date:'แถบวันที่',body:'เนื้อหาที่น่าจะใช่',mixed:'หัวข้อความ+เนื้อหาในกรอบเดียว',covered:'กรอบชื่อเดิมที่แยกอ่านใหม่แล้ว',graphic:'รูปภาพล้วนที่สงสัย (ไม่นำเข้า OCR อัตโนมัติ)',reply:'Reply — ข้อความอ้างอิง',header:'ชื่อผู้ใช้ / เวลา / ยศ',fragment:'ข้อความสั้นหรืออ่านไม่ครบ'};
 // Every row in a normal screenshot is reviewable. Cap the visual panel for
 // anomalously large files; ALL OCR candidates remain unmodified in memory.
 const cap=120;
 for(let index=0;index<Math.min(ocrLines.length,cap);index++){
  const line=ocrLines[index],entry=document.createElement('label');entry.className='review-item';
  const check=document.createElement('input');check.type='checkbox';check.checked=reviewSelection.has(index);
  check.setAttribute('aria-label',`นำบรรทัด ${index+1} เข้าทดสอบ`);
  check.addEventListener('change',()=>{
   if(check.checked){
    if(reviewSelection.size>=60){check.checked=false;say('เลือกได้สูงสุด 60 บรรทัดต่อรอบ เพื่อจำกัดหน่วยความจำบนมือถือ');return;}
    reviewSelection.add(index);
   }else reviewSelection.delete(index);
   updateReviewSummary();
  });
  const area=document.createElement('div');area.className='review-desc';
  const name=document.createElement('strong');name.textContent=`บรรทัด ${index+1} · ${line.alternateBody?'กรอบสำรอง (อ่านเมื่อจำเป็น)':kinds[line.kind]||'ยังไม่ทราบ'}`;
   const hint=document.createElement('small');hint.textContent=(line.reason||'ตรวจภาพด้วยตาก่อนเลือก')+(line.kind==='graphic'?' · หากเป็นรูปจริง ไม่ต้องติ๊กเพื่อให้ OCR อ่าน':'');
  const preview=originalPreview(line);preview.className='review-image';preview.setAttribute('aria-label',`ภาพต้นฉบับบรรทัด ${index+1}`);
  area.append(name,hint,preview);entry.append(check,area);host.append(entry);
 }
 if(ocrLines.length>cap){const extra=document.createElement('p');extra.textContent=`ภาพมีมากกว่า ${cap} บรรทัด: หน้าทบทวนแสดง ${cap} บรรทัดแรก แนะนำแบ่งภาพยาวเพื่อกันข้อมูลตกหล่น`;host.append(extra);}
 $('review-panel').hidden=false;updateReviewSummary();
}
async function reviewOnly(){
 if(busy)return;const file=$('photo').files?.[0];if(!file){say('เลือกภาพ Discord ก่อนจ้า');return;}
 toggleBusy(true);
 try{
  await detectLines(file);if(!reviewReady)defaultReviewSelection();renderReview();$('advanced-results').open=true;$('review-panel').open=true;refreshTranscript(true);
  say(`ตรวจพบ ${ocrLines.length} กรอบ (ไม่ใช่จำนวนแชท) · เลือกไว้ ${reviewSelection.size} · เลือกข้อความสั้น/Reply เพิ่มได้ก่อนเริ่มเปรียบเทียบ`);
 }catch(err){say('ตรวจภาพไม่สำเร็จ: '+String(err?.message||'ไม่ทราบสาเหตุ'));}
 finally{toggleBusy(false);}
}
async function run(){
 if(busy)return;const file=$('photo').files?.[0];if(!file){say('เลือกภาพ Discord ก่อนจ้า');return;}
 toggleBusy(true);stopRequested=false;wasCancelled=false;items=[];totalInferenceMs=0;tesseractLineMs=0;
 $('report').hidden=true;$('results').replaceChildren();$('fallback').hidden=true;$('copy-safe').disabled=true;$('progress').value=0;
 try{
  await detectLines(file);
  if(!reviewReady){defaultReviewSelection();renderReview();}
  const selected=[...reviewSelection].sort((a,b)=>a-b).filter(i=>i>=0&&i<ocrLines.length).map(index=>({line:ocrLines[index].alternateBody?{...ocrLines[index],kind:'body'}:ocrLines[index],index}));
  if(!selected.length){say('ไม่พบกรอบข้อความที่อ่านได้อัตโนมัติ · ตรวจภาพหรือเปิดเครื่องมือทดสอบขั้นสูง');return;}
  // Preserve any user-edited transcript while OCR results update.
  const makeItem=({line,index})=>({line,index,rawBaseline:line.text,baseline:line.text,candidate:null,error:null,truth:'',dom:null,prepared:preparedLineCanvas(line)});
  items=selected.map(makeItem);
  $('progress').max=items.length;$('report').hidden=false;
  for(const item of items){$('results').append(buildRow(item));}refreshStats();
  if(stopRequested){wasCancelled=true;return;}
  await loadOpenThai();stage='inference';
  for(let i=0;i<items.length;i++){
   if(stopRequested){wasCancelled=true;break;}
   const item=items[i];say(`กำลังให้ OpenThai อ่านบรรทัด ${i+1}/${items.length} (ทำทีละบรรทัดเพื่อลดภาระ Safari)`);
   try{
    if(item.prepared.cleaned||item.line.alternateBody){
     // Re-read the EXACT cleaned pixel region with Tesseract; comparing its old
     // full-image output against an edited OpenThai crop would be unfair.
     const started=performance.now();const reread=await (await getWorker()).recognize(item.prepared.canvas);
     tesseractLineMs+=Math.round(performance.now()-started);
     item.baseline=String(reread.data.text||'').replace(/\s+/g,' ').trim();
    }
    const result=await recognizeOne(item.prepared.canvas);
    item.candidate=result.text;totalInferenceMs+=result.took;
   }
   catch(err){item.error=true;const safe=diagnosticReport({stage:'inference',version:ORT_VERSION,attempts:runtimeAttempts,error:err});console.warn('Batch line inference failed; redacted: '+safe.split('\n').slice(-3).join(' | '));}
   updateRow(item);
   if(!stopRequested&&$('scope').value==='all'&&items.length<60&&needsAlternateReading(item.baseline,item.candidate,item.error)){
    const altIndex=ocrLines.findIndex((l,j)=>alternateMatches(l,item.line)&&!items.some(x=>x.index===j));
    if(altIndex>=0){const alt=makeItem({line:{...ocrLines[altIndex],kind:'body'},index:altIndex});items.push(alt);$('results').append(buildRow(alt));$('progress').max=items.length;}
   }
   $('progress').value=i+1;refreshStats();
   // Yield after each line so Safari can paint progress and handle cancel.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  const c=counts();say(wasCancelled?`หยุดแล้ว · ร่างอาจไม่ครบ (${c.done.length}/${items.length} กรอบ)`:`✓ อ่านเสร็จ ${c.done.length}/${items.length} กรอบ · ตรวจร่างบทสนทนาด้านล่างก่อนคัดลอก`);
 }catch(err){
  const safe=diagnosticReport({stage,version:ORT_VERSION,attempts:runtimeAttempts,error:err});
  say('⚠️ การทดลองไม่สำเร็จในขั้น '+stage+'\n'+safe+'\nข้อความแชทไม่ได้ถูกส่งออกจากเครื่อง');
 }finally{toggleBusy(false);refreshStats();if(ocrLines.length)refreshTranscript();}
}
$('start').addEventListener('click',run);
$('review').addEventListener('click',reviewOnly);
$('scope').addEventListener('change',()=>{if(reviewReady){defaultReviewSelection();renderReview();say('อัปเดตชุดตัวเลือกตามโหมดแล้ว · สามารถติ๊กเพิ่มหรือยกเลิกก่อนกดเริ่ม');}});
$('stop').addEventListener('click',()=>{stopRequested=true;$('stop').disabled=true;say('รับคำสั่งหยุดแล้ว · จะหยุดหลังบรรทัดปัจจุบัน (ไม่สามารถตัด ONNX ระหว่าง inference ได้)');});
$('layout-headers').addEventListener('change',()=>{transcriptEdited=false;imagePixels=null;imageCanvas=null;scannedFile=null;ocrLines=[];items=[];clearReview();$('report').hidden=true;$('transcript-panel').hidden=true;say('เปลี่ยนตัวเลือกแยกแถวชื่อแล้ว · กดตรวจทั้งภาพอีกครั้ง');});
$('photo').addEventListener('change',()=>{transcriptEdited=false;$('advanced-settings').open=false;$('advanced-results').open=false;imagePixels=null;imageCanvas=null;scannedFile=null;ocrLines=[];items=[];clearReview();$('report').hidden=true;$('transcript-panel').hidden=true;$('results').replaceChildren();$('copy-safe').disabled=true;});
$('crop').addEventListener('change',()=>{transcriptEdited=false;$('transcript-panel').hidden=true;imagePixels=null;imageCanvas=null;scannedFile=null;ocrLines=[];items=[];clearReview();$('report').hidden=true;$('results').replaceChildren();});
$('copy-safe').addEventListener('click',()=>copyOrShow(safeReport()));
$('copy-text').addEventListener('click',()=>copyOrShow(transcriptReport()));
$('transcript-text').addEventListener('input',()=>{transcriptEdited=true;});
$('transcript-refresh').addEventListener('click',()=>{transcriptEdited=false;refreshTranscript(true);});
$('copy-transcript').addEventListener('click',()=>copyOrShow($('transcript-text').value));
window.addEventListener('pagehide',()=>{try{worker?.terminate();onnx?.release();}catch(_){}});
