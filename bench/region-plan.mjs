/** Experimental Discord dark-mobile geometry. No OCR text is synthesized.
 * A skipped alternative remains reviewable; all gates fail open on uncertainty. */
import {parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
const valid=b=>b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0;
const span=(a,b)=>Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
const color=(r,g,b)=>(g>=112&&g>r*1.18&&g>b*1.07)||(b>=132&&b>r*1.08&&b>g*1.07);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function stats(p,w,h,b){
 let total=0,bright=0,gray=0,chip=0,colored=0,ink=0;
 for(let y=clamp(Math.floor(b.y0),0,h);y<clamp(Math.ceil(b.y1),0,h);y++)for(let x=clamp(Math.floor(b.x0),0,w);x<clamp(Math.ceil(b.x1),0,w);x++){
  const i=(y*w+x)*4,r=p[i],g=p[i+1],b=p[i+2],lo=Math.min(r,g,b),hi=Math.max(r,g,b);total++;
  if(hi>100)ink++;if(color(r,g,b))colored++;
  if(hi-lo<25){if(lo>=180)bright++;else if(lo>=95)gray++;if(lo>=34&&hi<=100)chip++;}
 }
 return {total,bright,gray,chip,colored,ink};
}
const stamp=r=>parseDiscordTimestamp(String(r?.text??''),{allowBare24:true});
const isHead=r=>['header','mixed'].includes(r?.kind)&&Boolean(stamp(r));
/** A split body can be skipped only if one real standalone body covers the
 * same row and no bright/colored ink on the text side lies outside its padded
 * box. Inspect the entire recovery width, not just its potentially clipped x1. */
export function redundantSplit(split,rows,p,w,h,column){
 const s=split?.bbox;if(!split?.needsBodyRead||!valid(s)||!column||!p||p.length!==w*h*4)return null;
 const candidates=rows.filter(r=>r.kind==='body'&&!r.splitBody&&valid(r.bbox)&&r.bbox.x1>column.x+12&&Math.abs(r.bbox.x0-column.x)<=Math.max(12,w*.012)&&span(s,r.bbox)>=.8*Math.min(s.y1-s.y0,r.bbox.y1-r.bbox.y0)&&Math.min(s.y1-s.y0,r.bbox.y1-r.bbox.y0)>=.65*Math.max(s.y1-s.y0,r.bbox.y1-r.bbox.y0));
 if(candidates.length!==1)return null;
 const b=candidates[0].bbox,pad=4;let inside=0;
 for(let y=Math.max(0,Math.floor(s.y0));y<Math.min(h,Math.ceil(s.y1));y++)for(let x=Math.max(0,Math.floor(column.x-5));x<Math.min(w,Math.ceil(Math.max(s.x1,w*.95)));x++){
  const i=(y*w+x)*4,hi=Math.max(p[i],p[i+1],p[i+2]);if(hi<95)continue;
  if(x<b.x0-pad||x>=b.x1+pad||y<b.y0-pad||y>=b.y1+pad)return null;
  inside++;
 }
 return inside>=12?candidates[0]:null;
}
/** Remove only clearly blank right padding from a recovery strip, retaining
 * every visible ink island and a margin; if no ink, keep original rectangle. */
export function tightenRecovery(box,p,w,h,column){
 if(!valid(box)||!p||p.length!==w*h*4||!column)return box;
 let last=-1;
 for(let y=Math.max(0,Math.floor(box.y0)-4);y<Math.min(h,Math.ceil(box.y1)+4);y++)for(let x=Math.max(0,Math.floor(column.x-5));x<Math.min(w,Math.ceil(box.x1));x++){
  const i=(y*w+x)*4;if(Math.max(p[i],p[i+1],p[i+2])>=90)last=Math.max(last,x);
 }
 if(last<column.x||last+8>=box.x1)return box;
 return {...box,x1:Math.max(box.x0+1,last+8)};
}
/** Identify a compact avatar + indented colored name + muted quote before a
 * real timed header. This is separate from text-based @ detection. */
function replyShape(row,p,w,h,column){
 const b=row.bbox,H=b.y1-b.y0,X=column.x;
 if(Math.abs(b.x0-X)>Math.max(8,H*.3)||b.x1<X+H*3||stamp(row))return false;
 const avatar=stats(p,w,h,{...b,x0:X,x1:X+H*.82});
 const gutter=stats(p,w,h,{...b,x0:X+H*.83,x1:X+H*1.03});
 const name=stats(p,w,h,{...b,x0:X+H*1.1,x1:Math.min(b.x1,X+H*3.4)});
 const rest=stats(p,w,h,{...b,x0:Math.min(b.x1,X+H*3.4)});
 return avatar.ink/avatar.total>.26&&gutter.ink/Math.max(1,gutter.total)<.28&&name.colored>12&&rest.gray>=12&&rest.bright<rest.gray*.4;
}
function grayContinuation(row,p,w,h,column){
 const b=row.bbox,H=b.y1-b.y0;
 if(Math.abs(b.x0-column.x)>Math.max(8,H*.25)||stamp(row))return false;
 // Inspect the start of the line, not a possible white-backed trailing emoji.
 const s=stats(p,w,h,{...b,x1:Math.min(b.x1,b.x0+H*1.6)});
 return s.gray>=12&&s.bright<=s.gray*.12&&s.colored<=s.gray*.2;
}
/** Preserve order; a continuation must be bracketed by a reply and a verified
 * timed header. UI suppression requires a gray control background, not text. */
export function classifyStructure(rows,p,w,h,column){
 if(!column||!p||p.length!==w*h*4)return rows;
 const out=rows.map(r=>({...r})).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
 for(let i=0;i<out.length;i++){
  const r=out[i],b=r.bbox;if(!valid(b))continue;const H=b.y1-b.y0,W=b.x1-b.x0;
  if(r.kind==='header'&&!stamp(r)&&replyShape(r,p,w,h,column)){
   const n=out[i+1];if(isHead(n)&&n.bbox.y0-b.y1>=-3&&n.bbox.y0-b.y1<=H*.8){r.kind='reply';r.reason='รูปอ้างอิงขนาดเล็ก + ชื่อเยื้อง + ข้อความสีเทา';}
  }
  if(r.kind==='reply'){
   const next=out[i+1],after=out[i+2];
   if(next?.kind==='body'&&isHead(after)&&next.bbox.y0-b.y1>=-2&&next.bbox.y0-b.y1<=H*.45&&after.bbox.y0-next.bbox.y1>=-2&&after.bbox.y0-next.bbox.y1<=H*.65&&grayContinuation(next,p,w,h,column)){
    next.kind='reply';next.replyContinuation=true;next.reason='บรรทัดต่อเนื่องของ Reply ก่อนหัวข้อความจริง';
   }
  }
  if(r.kind==='fragment'&&!stamp(r)&&H>=12&&W/H>=.65&&W/H<=3.2){
   const s=stats(p,w,h,b),control=s.chip/s.total>.42&&s.bright/s.total<.06&&s.colored/s.total<.08;
   const arrow=b.x0>w*.90&&b.y0>h*.75&&W/H<=1.6;
   const reaction=b.x0>column.x+H*.85&&b.x1<column.x+H*7&&!/[\p{L}]/u.test(String(r.text||''));
   if(control&&(arrow||reaction)){r.kind='graphic';r.reason=arrow?'ปุ่มควบคุมชิดขวาล่าง':'ปุ่ม Reaction ที่สงสัย (ทบทวนได้)';}
  }
 }
 return out;
}
/** Name-only box from observed colored ink. A gray chip is excluded only
 * with a sustained raised background after name ink. No known badge strings. */
export function isolateNameBox(box,p,w,h,column){
 if(!valid(box)||!column||!p||p.length!==w*h*4)return null;
 const H=box.y1-box.y0,start=Math.max(0,Math.round(column.x-6)),end=Math.min(w,Math.ceil(box.x1));
 if(H<12||H>100||end<=start+12)return null;
 const top=clamp(Math.floor(box.y0+H*.15),0,h),bottom=clamp(Math.ceil(box.y1-H*.15),0,h);
 let first=-1,last=-1,chipStart=-1,run=-1;
 for(let x=start;x<end;x++){
  const s=stats(p,w,h,{x0:x,x1:x+1,y0:top,y1:bottom});
  if(s.colored>=2){if(first<0)first=x;last=x;}
  if(first>=0&&x-first>H&&s.chip/Math.max(1,s.total)>=.55){if(run<0)run=x;if(x-run>=Math.max(5,H*.18)){chipStart=run;break;}}else run=-1;
 }
 if(chipStart>=0){last=-1;for(let x=start;x<chipStart;x++){if(stats(p,w,h,{x0:x,x1:x+1,y0:top,y1:bottom}).colored>=2)last=x;}}
 if(first<0||last-first<12||Math.abs(first-column.x)>Math.max(8,H*.3))return null;
 // Require a noncolored region after name, usually timestamp or badge; do
 // not claim a complete name when color reaches the right ROI boundary.
 if(last+6>=end)return null;
 return {x0:Math.max(0,Math.min(start,first-5)),x1:Math.min(end,chipStart>=0?chipStart:last+6),y0:Math.max(0,Math.floor(box.y0)-2),y1:Math.min(h,Math.ceil(box.y1)+2),badge:chipStart>=0};
}

// If two OCR readings disagree beyond spacing/punctuation, the saved region
// remains useful. Run it only on demand instead of paying for every duplicate.
const compact=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').replace(/[^\p{L}\p{M}\p{N}]/gu,'').toLowerCase();
export function needsAlternateReading(baseline,candidate,error=false){
 const a=compact(baseline),b=compact(candidate);return Boolean(error||!a||!b||a!==b);
}
export function alternateMatches(alt,primary){
 const a=alt?.primaryBox,b=primary?.bbox;return Boolean(alt?.alternateBody&&valid(a)&&valid(b)&&['x0','x1','y0','y1'].every(k=>a[k]===b[k]));
}
