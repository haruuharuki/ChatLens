/**
 * Conservative Discord text-only research guard. This is NOT a detector and is
 * not used by the main ChatLens app. Never mutate the screenshot or invent text.
 */
const THAI=/[\u0E01-\u0E5B]/u;
const TIME=/\b(?:0?[1-9]|1[0-2])[:.][0-5]\d\s*(?:AM|PM)\b/i;
const REPLY=/^(?:[\s\u2018\u2019\u201c\u201d'".›>•\d]{0,5})@|^(?:↳|ตอบกลับ\s*[:：])/u;
const USER=/^(?:\[\s*(?:\d{1,2}|staff)\s*\]|\d{1,2}\s*[|｜]|multiple\b)/iu;
const BADGE=/\b(?:TTO|DAV|APP|MEOW|Online)\b/i;

function numberInRange(value,lo,hi){return Number.isFinite(value)?Math.max(lo,Math.min(hi,value)):lo;}
function sampleColor(r,g,b){const max=Math.max(r,g,b),min=Math.min(r,g,b);return max>125&&max-min>55;}
function nearNeutralInk(r,g,b){return Math.min(r,g,b)>143&&Math.max(r,g,b)-Math.min(r,g,b)<65;}

/** Inspect only the LEFT half of a line for name-color hints; emoji at right
 * must not automatically turn an ordinary message into a header. */
export function coloredNameFraction(rgba,width,height,box){
 if(!rgba||rgba.length<width*height*4||!box)return 0;
 const x0=numberInRange(Math.floor(box.x0),0,width),x1=numberInRange(Math.floor(box.x1),x0,width);
 const y0=numberInRange(Math.floor(box.y0),0,height),y1=numberInRange(Math.floor(box.y1),y0,height);
 const end=Math.min(x1,x0+Math.floor((x1-x0)*.58));let ink=0,colored=0;
 for(let y=y0;y<y1;y+=3)for(let x=x0;x<end;x+=3){
  const i=(y*width+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
  if(Math.max(r,g,b)>120){ink++;if(sampleColor(r,g,b))colored++;}
 }
 return ink?colored/ink:0;
}

/** Deliberately classifies weak/partial OCR conservatively rather than
 * trying to infer a message author from its accidental fragments. */
export function classifyDiscordLine(line,{coloredFraction=0}={}){
 const text=String(line?.text??'').trim().replace(/\s+/g,' ');
 if(!text)return {kind:'fragment',reason:'ไม่มีตัวอักษร'};
 if(REPLY.test(text))return {kind:'reply',reason:'ขึ้นต้นแบบข้อความอ้างอิงของ Discord'};
 if(TIME.test(text))return {kind:'header',reason:'มีเวลาอยู่ในบรรทัดหัวข้อความ'};
 if((USER.test(text)||BADGE.test(text))&&coloredFraction>.15)return {kind:'header',reason:'พบสีชื่อผู้ใช้หรือป้ายยศ'};
 const thaiCount=Array.from(text).filter(ch=>THAI.test(ch)).length;
 if(thaiCount<5||text.length<8)return {kind:'fragment',reason:'ส่วนข้อความสั้นเกินกว่าจะนับเป็นบรรทัดเนื้อหา'};
 if(coloredFraction>.45)return {kind:'header',reason:'ตัวอักษรสีเด่นแบบหัวข้อความ'};
 return {kind:'body',reason:'บรรทัดข้อความที่น่าจะเป็นเนื้อหา'};
}

/** Mask saturated decorations, preserve near-white text. Also choose a single
 * strongest white text band if an OCR box accidentally spans two rows.
 * Returns a NEW pixel buffer; never changes the user's image. */
export function cleanBodyLineRGBA(rgba,width,height,{absoluteX=0,canvasWidth=0,enableAvatarGuard=true}={}){
 if(!rgba||rgba.length!==width*height*4||width<1||height<1)throw new Error('Invalid pixel input');
 const out=new Uint8ClampedArray(rgba),fontRows=new Float64Array(height);
 let removedColor=0,removedAvatar=0;
 // auto crop has already removed most of the avatar; guard only the leftover
 // extreme-left strip, never a blanket cut into the message text column.
 const edge=enableAvatarGuard&&canvasWidth>0?Math.floor(canvasWidth*.016):0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,r=out[i],g=out[i+1],b=out[i+2];
  if(enableAvatarGuard&&absoluteX+x<edge){out[i]=out[i+1]=out[i+2]=26;removedAvatar++;continue;}
  if(sampleColor(r,g,b)){
   // Keep a conservative luminance-dark background; don't invent glyphs.
   out[i]=out[i+1]=out[i+2]=26;removedColor++;
  }
  if(nearNeutralInk(out[i],out[i+1],out[i+2]))fontRows[y]++;
 }
 let band=null;
 // Short tight boxes usually contain one text row. Don't risk trimming Thai
 // diacritics; a multi-row box needs a strongly dominant band.
 if(height>=49){
  const threshold=Math.max(2,Math.ceil(width*.011));const groups=[];
  let from=-1,score=0,last=-1;
  for(let y=0;y<height;y++){
   if(fontRows[y]>=threshold){if(from<0)from=y;score+=fontRows[y];last=y;}
   else if(from>=0 && (y-last)>2){groups.push({from,to:last,score});from=-1;score=0;}
  }
  if(from>=0)groups.push({from,to:last,score});
  groups.sort((a,b)=>b.score-a.score);
  const strongest=groups[0],runner=groups[1];
  if(strongest&&strongest.to-strongest.from+1>=7&&strongest.to-strongest.from+1<height*.75&&(!runner||strongest.score>runner.score*1.25)){
   band={top:Math.max(0,strongest.from-3),bottom:Math.min(height,strongest.to+4)};
  }
 }
 return {pixels:out,band,removedColor,removedAvatar};
}
