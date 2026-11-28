/**
 * Phase C.3: research-only image-region triage. This estimates whether a
 * Tesseract line box contains text, an image-only block, or a mixed
 * author/header+body block. It is NOT a Discord message detector.
 * Never mutate input or discard a detected box; a user may review any box.
 */
import {parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const neutral=(r,g,b)=>Math.min(r,g,b)>175&&Math.max(r,g,b)-Math.min(r,g,b)<48;
const chroma=(r,g,b)=>Math.max(r,g,b)>115&&Math.max(r,g,b)-Math.min(r,g,b)>65;

/** A high-confidence veto for OCR boxes covering profile photos / attachments.
 * Require near-square area, substantial varied image color AND little visible
 * OCR text. A colorful textual sticker may be left as uncertain for review.
 */
export function auditDetectedRegion(line,pixels,width,height,{typicalHeight=0}={}){
 const box=line?.bbox;
 if(!box||!pixels||pixels.length!==width*height*4)return {kind:line?.kind||'fragment',reason:'ไม่มีข้อมูลภาพ'};
 const x0=clamp(Math.floor(box.x0),0,width),x1=clamp(Math.ceil(box.x1),0,width);
 const y0=clamp(Math.floor(box.y0),0,height),y1=clamp(Math.ceil(box.y1),0,height);
 const w=x1-x0,h=y1-y0;
 if(w<4||h<4)return {kind:line.kind,reason:line.reason||'กรอบเล็กเกินไป'};
 let total=0,color=0,gray=0,white=0;
 const stride=Math.max(1,Math.floor(Math.max(w,h)/120));
 const rowWhite=new Float64Array(h),rowColor=new Float64Array(h);
 for(let y=y0;y<y1;y+=stride)for(let x=x0;x<x1;x+=stride){
  const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  total++;
  if(chroma(r,g,b)){color++;rowColor[y-y0]++;}
  if(neutral(r,g,b)){white++;rowWhite[y-y0]++;}
  if(Math.min(r,g,b)>60&&Math.max(r,g,b)<205){gray++;}
 }
 const content=String(line.text||'').trim();
 const thaiCount=Array.from(content).filter(x=>/[\u0e01-\u0e5b]/u.test(x)).length;
 const imageLike=(color+gray)/Math.max(1,total);
 const squareish=w/h>.45&&w/h<2.3;
 // A profile avatar clipped by Auto Crop may be a narrow *sliver*, not a
 // square. Its accidental OCR ('p a', etc.) should not become chat text.
 // Require image-like pixels, very little readable Thai, no clock AND an
 // extreme-left start before the actual Discord text column.
 const avatarSliver=x0<width*.035&&x1<width*.23&&imageLike>.20&&thaiCount<3&&!parseDiscordTimestamp(content,{allowBare24:line.kind==='header'||line.kind==='mixed'});
 if(avatarSliver)return {kind:'graphic',reason:'ชิ้นส่วนรูปโปรไฟล์ชิดขอบ ไม่ใช่เนื้อหาข้อความ',imageLike,bodyBand:null};
 const standaloneArtwork=squareish&&h>=Math.max(28,typicalHeight*.75)&&
    imageLike>.35&&white/total<.27&&thaiCount<3&&!parseDiscordTimestamp(content,{allowBare24:line.kind==='header'||line.kind==='mixed'});
 if(standaloneArtwork){return {kind:'graphic',reason:'สงสัยเป็นภาพล้วน (ไม่มีเนื้อหาตัวอักษรเพียงพอ) · ตรวจทบทวนได้',imageLike,bodyBand:null};}
 // Real mobile Discord headers often share a Tesseract rectangle with a
 // SECOND white message row. Only trim when the lower white band is distinct.
 const bodyBand=findLowerBodyBand(rowWhite,rowColor,h,stride,w);
 const isTall=typicalHeight>=11&&h>=typicalHeight*1.43;
 const likelyHeader=line.kind==='header'||line.kind==='mixed';
 if(isTall&&likelyHeader&&bodyBand){return {kind:'mixed',reason:'กรอบหัวข้อความรวมเนื้อหา · แยกทดลองเฉพาะแถวเนื้อหาสีขาว',bodyBand,imageLike};}
 return {kind:line.kind,reason:line.reason||'รอตรวจทบทวน',bodyBand:null,imageLike};
}

function findLowerBodyBand(whiteRows,colorRows,height,stride,width){
 if(height<36)return null;
 const half=Math.floor(height*.46);
 let topColor=0,lowWhite=0,topWhite=0;
 for(let y=0;y<height;y++){
  if(y<half){topColor+=colorRows[y];topWhite+=whiteRows[y];}
  else lowWhite+=whiteRows[y];
 }
 const need=Math.max(3,Math.ceil(width*.015/stride));
 if(lowWhite<Math.max(8,topWhite*1.25)||topColor<Math.max(5,need*1.5))return null;
 let first=-1,last=-1;
 for(let y=half;y<height;y++){
  if(whiteRows[y]>=need){if(first<0)first=y;last=y;}
 }
 if(first<0||last-first<Math.max(4,stride*2))return null;
 return {top:clamp(first-5,0,height),bottom:clamp(last+stride+6,0,height)};
}

/**
 * Tesseract can end a box mid-sentence. Scan only the same horizontal text
 * band, to see whether visible ink continues just beyond its right edge.
 * Never extend blindly: images or blank whitespace require review instead.
 */
export function extendTextRight(pixels,width,height,box,{maxAddedFraction=.32}={}){
 if(!pixels||pixels.length!==width*height*4||!box)return null;
 const x0=clamp(Math.floor(box.x0),0,width),x1=clamp(Math.ceil(box.x1),0,width);
 const y0=clamp(Math.floor(box.y0),0,height),y1=clamp(Math.ceil(box.y1),0,height);
 const h=y1-y0;
 if(h<9||x1>=width-12)return null;
 const searchTo=Math.min(width-8,x1+Math.round(width*maxAddedFraction));
 if(searchTo-x1<12)return null;
 const column=new Uint16Array(searchTo-x1),inc=2;
 for(let x=x1;x<searchTo;x+=inc)for(let y=y0;y<y1;y+=inc){
  const i=(y*width+x)*4;
  if(neutral(pixels[i],pixels[i+1],pixels[i+2])||chroma(pixels[i],pixels[i+1],pixels[i+2]))column[x-x1]++;
 }
 const threshold=Math.max(2,Math.floor(h/inc*.055));
 const connect=Math.min(28,Math.round(h*.65));
 let starts=false,last=-1;
 for(let x=0;x<Math.min(column.length,connect);x++)if(column[x]>=threshold){starts=true;break;}
 if(!starts)return null;
 // Follow ink islands across narrow natural spaces, not all the way across
 // the screenshot if separated by a large void.
 let gap=0;
 for(let x=0;x<column.length;x+=inc){
  if(column[x]>=threshold){last=x;gap=0;}else gap+=inc;
  if(last>=0&&gap>Math.max(20,h*.8))break;
 }
 if(last<6)return null;
 return clamp(x1+last+7,x1,searchTo);
}
