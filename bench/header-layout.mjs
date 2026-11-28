/**
 * Phase D.1: Independent *geometric* candidate headers for Discord dark mobile.
 * Color is a layout clue, NOT OCR. We still need a verified timestamp and OCR
 * before assigning an author. Never modifies the original screenshot pixels.
 */
import {parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
const sat = (r,g,b) => (g>=112 && g>r*1.18 && g>b*1.07) ||
  (b>=132 && b>r*1.08 && b>g*1.07);
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
/** Locate name-colored horizontal bands where normal message headers begin.
 * Reject small colorful icons, narrow emojis, and reply previews indented more
 * than a normal author name. Return candidate geometry, NOT accepted names.
 */
export function discoverHeaderBands(pixels,width,height){
 if(!pixels||pixels.length!==width*height*4||width<240||height<150)return [];
 const left=Math.round(width*.07),right=Math.round(width*.86),counts=new Uint16Array(height);
 const rowMin=new Int32Array(height).fill(width),rowMax=new Int32Array(height).fill(-1);
 for(let y=0;y<height;y++)for(let x=left;x<right;x+=2){
  const i=(y*width+x)*4;
  if(!sat(pixels[i],pixels[i+1],pixels[i+2]))continue;
  counts[y]++;rowMin[y]=Math.min(rowMin[y],x);rowMax[y]=Math.max(rowMax[y],x);
 }
 const bands=[];let start=-1,last=-1;
 function flush(){
  if(start<0)return;
  const tall=last-start+1;let min=width,max=-1,ink=0;
  for(let y=start;y<=last;y++){min=Math.min(min,rowMin[y]);max=Math.max(max,rowMax[y]);ink+=counts[y];}
  const span=max-min;
  // The normal author column begins near the left after the profile avatar.
  // An indented mention/reply is not a standalone speaker header.
  if(tall>=12&&tall<=85&&min<=width*.135&&span>=width*.105&&ink>=70){
   bands.push({y0:clamp(start-6,0,height),y1:clamp(last+7,0,height),
    x0:clamp(min-10,0,width),x1:clamp(Math.round(width*.98),0,width),
    nameStart:min,nameEnd:max,ink});
  }
  start=-1;last=-1;
 }
 for(let y=0;y<height;y++){
  if(counts[y]>=8){if(start<0)start=y;last=y;}
  else if(start>=0&&y-last>8)flush();
 }
 flush();
 return bands;
}

/** Partition Tesseract boxes against an independently found header row.
 * A combined header+body Tesseract box is split geometrically so its lower
 * content is not reinterpreted as a second author's name. Pure transformation.
 */
export function splitBoxesAtHeaders(lines,bands,width){
 if(!Array.isArray(lines)||!bands?.length)return {lines:lines||[],split:0,covered:0};
 const out=[];let split=0,covered=0;
 for(const line of lines){
  if(['graphic','reply','date'].includes(line.kind)){out.push(line);continue;}
  const b=line.bbox;
  const hit=bands.find(h=>Math.min(h.y1,b.y1)-Math.max(h.y0,b.y0)>=Math.min(12,(b.y1-b.y0)*.35)
    &&b.x0<width*.91);
  if(!hit){out.push(line);continue;}
  const lower=Math.round(hit.y1+4);
  if(b.y1-lower>=17 && b.y1-b.y0<=170){
   // Lower band must start under the colored name row. We deliberately do not
   // reuse mixed OCR: it contains a header, so caller must re-read this crop.
   out.push({...line,kind:'body',bbox:{x0:Math.max(b.x0,Math.round(width*.075)),y0:lower,
     x1:b.x1,y1:b.y1},text:'',needsBodyRead:true,reason:'แยกข้อความใต้แถวชื่อด้วยตำแหน่งภาพ'});
   split++;
  }else{out.push({...line,kind:'covered',reason:'อ่านแถวชื่อแยกต่างหาก'});covered++;}
 }
 return {lines:out,split,covered};
}

/** Merge independently read username and clock without ever inferring a name
 * or time. If isolated-name OCR is gibberish, preserve the full/header evidence.
 * A badge (TTO/DAV/etc) may be between username and time.
 */
export function combineRecognizedHeader({full='',nameOnly='',nearby=''}={}){
 const fullTime=parseDiscordTimestamp(full,{allowBare24:true}),nearTime=parseDiscordTimestamp(nearby,{allowBare24:true});
 const evidence=fullTime||nearTime;
 const time=evidence?.raw||null;
 const ownTime=parseDiscordTimestamp(nameOnly);
 const rawName=(ownTime?String(nameOnly).slice(0,ownTime.index):String(nameOnly)).replace(/\s+/g,' ').trim();
 // Do not drop leading digits from a name: some real Discord handles start
 // with numbers. Cropping out avatar pixels is responsible for this cleanup.
 const name=rawName.replace(/^[:.,\s]+/,'').trim();
 const letterCount=Array.from(name).filter(c=>/[\p{L}]/u.test(c)).length;
 const plausible=name.length>=2&&name.length<=90&&letterCount>=2&&
   !/^[a-z]{1,2}\s+[a-z]{1,2}$/i.test(name)&&
   !/\b(?:TTO|DAV|MEOW|APP)\b/i.test(name)&&
   !(name.match(/[<>{}\^~@#$%]/g)||[]).length;
 if(time&&plausible){
  const original=nearTime?String(nearby).slice(0,nearTime.index).trim():'';
  if(original.length>name.length&&original.endsWith(name)&&(!fullTime||fullTime.time===nearTime.time))return {text:String(nearby).trim(),usedNameOnly:false};
  if(fullTime&&!fullTime.date&&nearTime?.date&&fullTime.time===nearTime.time)return {text:`${name} ${nearTime.raw}`,usedNameOnly:true};
 }
 if(time&&plausible)return {text:`${name} ${time}`,usedNameOnly:true};
 return {text:fullTime?String(full).trim():nearTime?String(nearby).trim():String(full).trim(),usedNameOnly:false};
}