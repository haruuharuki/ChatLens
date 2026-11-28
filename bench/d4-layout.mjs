/** Dark mobile Discord geometry. No private text or device-specific coordinates. */
import {parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
const valid=b=>b&&b.x1>b.x0&&b.y1>b.y0;
const span=(a,b)=>Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
const median=a=>a.length?a.sort((x,y)=>x-y)[Math.floor(a.length/2)]:0;
const rgb=(p,w,x,y)=>{const i=(Math.floor(y)*w+Math.floor(x))*4;return [p[i],p[i+1],p[i+2]];};
const near=(a,b,t=3)=>a.every((v,i)=>Math.abs(v-b[i])<=t);
const lum=a=>Math.max(...a);
export function conversationCrop(p,w,h){
 const full={x:0,y:0,width:w,height:h,cropped:false};
 if(!p||p.length!==w*h*4||w<300||h/w<1.4)return full;
 const bg=rgb(p,w,w*.01,h*.5);if(lum(bg)>55)return full;
 const raised=c=>lum(c)>=lum(bg)+7&&lum(c)<=lum(bg)+25&&Math.max(...c)-Math.min(...c)<12;
 const wide=(y,lo,hi,pred)=>{let n=0;for(let i=0;i<32;i++)if(pred(rgb(p,w,w*(lo+(hi-lo)*i/31),y)))n++;return n>=30;};
 // Composer must have a sustained wide raised surface near bottom and a dark margin.
 let bottom=-1,run=-1;
 for(let y=Math.floor(h*.76);y<Math.floor(h*.98);y++){
  const yes=wide(y,.14,.86,raised)&&near(rgb(p,w,w*.005,y),bg,5)&&near(rgb(p,w,w*.995,y),bg,5);
  if(yes){if(run<0)run=y;if(y-run>=w*.028){bottom=run;break;}}else run=-1;
 }
 if(bottom<0)return full;
 // Thin near-full-width separator: require dark background immediately above; chat may touch the lower edge.
 let top=-1;
 for(let y=Math.floor(h*.045);y<Math.floor(h*.18);y++){
  if(!wide(y,.005,.995,raised))continue;
  let end=y;while(end+1<h&&wide(end+1,.005,.995,raised))end++;
  if(end-y+1<=Math.max(5,w*.008)&&wide(Math.max(0,y-4),.03,.97,c=>near(c,bg,5)))top=end+1;
  y=end;
 }
 if(top<0)return full; // do not crop previously cropped or ambiguous pictures
 // Keep all rows above the first sustained composer surface.
 const safeBottom=Math.max(top+1,bottom);
 const x=Math.round(w*.06);return {x,y:top,width:w-x,height:safeBottom-top,cropped:true};
}
function ink(p,w,x,y){const c=rgb(p,w,x,y);return lum(c)>155&&Math.max(...c)-Math.min(...c)<35;}
/** Highlighted mention has a broad blue/purple dark background, unlike reply preview. */
export function hasMentionBackground(b,p,w,h,column){
 if(!valid(b)||!column||!p||p.length!==w*h*4)return false;
 const H=b.y1-b.y0;const x0=Math.max(0,Math.floor(column.x)),x1=Math.min(w,Math.ceil(b.x1),x0+H*5);
 let n=0,total=0;
 for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,b.y1);y+=2)for(let x=x0;x<x1;x+=2){const [r,g,bl]=rgb(p,w,x,y);total++;if(bl>=45&&bl<=140&&bl>r+12&&bl>g+9&&r<100)n++;}
 return total>0&&n/total>.22;
}
/** A broad OCR container can include both a timed header and a highlighted
 * mention on the next physical row. Preserve the header evidence until split.
 * The timestamp alone is insufficient: require a separate lower mention box
 * (or the already observed body band) and no highlight on the upper row. */
export function mixedMentionContainer(row,rows,p,w,h,column){
 const b=row.bbox;if(!valid(b)||!['header','mixed'].includes(row.kind)||!parseDiscordTimestamp(String(row.text||''),{allowBare24:true}))return false;
 const H=b.y1-b.y0;
 const lower=rows.filter(q=>q!==row&&valid(q.bbox)&&q.bbox.y0>=b.y0+H*.35&&q.bbox.y0<b.y1&&span(b,q.bbox)>=.65*(q.bbox.y1-q.bbox.y0)&&hasMentionBackground(q.bbox,p,w,h,column));
 const cut=lower.length===1?lower[0].bbox.y0:row.bodyBand&&row.bodyBand.top>=H*.35?b.y0+row.bodyBand.top:null;
 return cut!==null&&cut<b.y1&&!hasMentionBackground({...b,y1:cut-2},p,w,h,column)&&hasMentionBackground({...b,y0:cut},p,w,h,column);
}
/** The candidate strip owns its own pixels. A mention in a different row
 * cannot veto a real header merely because the OCR container overlaps both. */
export function headerBandBlocked(box,rows,p,w,h,column){
 if(hasMentionBackground(box,p,w,h,column))return true;
 return rows.some(r=>r.kind==='reply'&&valid(r.bbox)&&span(box,r.bbox)>=.6*(r.bbox.y1-r.bbox.y0));
}
/** Limit fallback clock evidence to the first physical row of a container. */
export function headerClockAligned(box,row){
 const b=row.bbox;if(!valid(box)||!valid(b))return false;
 const H=box.y1-box.y0;
 return span(box,b)>=Math.min(12,(b.y1-b.y0)*.35)&&Math.abs(box.y0-b.y0)<=Math.max(12,H*.65);
}
/** Detect small isolated circular bullet in left margin, with distinct text following. */
export function bulletRegion(b,p,w,h,column){
 if(!valid(b)||!column)return null;const H=b.y1-b.y0,X=column.x;
 if(Math.abs(b.x0-X)>Math.max(12,H*.4)||H<16||b.x1<X+H*1.2)return null;
 const start=Math.max(0,Math.floor(X-H*.15)),end=Math.min(w,Math.ceil(X+H*.65));
 const pts=[];for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,b.y1);y++)for(let x=start;x<end;x++)if(ink(p,w,x,y))pts.push([x,y]);
 if(!pts.length)return null;const x0=Math.min(...pts.map(v=>v[0])),x1=Math.max(...pts.map(v=>v[0]))+1,y0=Math.min(...pts.map(v=>v[1])),y1=Math.max(...pts.map(v=>v[1]))+1;
 const W=x1-x0,T=y1-y0;if(W<3||T<3||W>H*.44||T>H*.44||W/T<.65||W/T>1.5||pts.length/(W*T)<.55||Math.abs((y0+y1)/2-(b.y0+b.y1)/2)>H*.25)return null;
 let next=-1;for(let x=x1;x<Math.min(w,b.x1,X+H*1.5);x++){let n=0;for(let y=Math.max(0,b.y0);y<Math.min(h,b.y1);y++)if(ink(p,w,x,y))n++;if(n>=2){next=x;break;}}
 return next>=x1+H*.12?{x0:next-2}:null;
}
/** Avatar-only left edge of a real quote: dense compact ink, empty gutter,
 * and visible name ink after it. No name or text substitutions. */
export function replyTextLeft(b,p,w,h,column){
 if(!valid(b)||!column||Math.abs(b.x0-column.x)>Math.max(12,(b.y1-b.y0)*.4))return null;
 const H=b.y1-b.y0,X=Math.max(0,Math.floor(b.x0)),end=Math.min(w,Math.ceil(b.x1),X+Math.ceil(H*1.5));
 let dense=0,gap=0,gapStart=-1;
 for(let x=X;x<end;x++){
  let n=0;for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,Math.ceil(b.y1));y++)if(lum(rgb(p,w,x,y))>100)n++;
  if(gap>=Math.max(3,H*.06)&&gapStart-X>=H*.4&&gapStart-X<=H*1.15&&n/H>.08)return Math.max(X,gapStart+gap-2);
  if(n/H>.42){dense++;gap=0;gapStart=-1;}
  else if(n/H<.04&&dense>=H*.3){if(!gap)gapStart=x;gap++;}
  else {gap=0;gapStart=-1;}
 }
 return null;
}
function controlRegion(b,p,w,h,column){
 const H=b.y1-b.y0,W=b.x1-b.x0;if(H<12||W/H<.6||W/H>3.5)return false;
 const arrow=b.x0>w*.85&&b.y0>h*.65&&W/H<1.6;
 const reaction=b.x0>column.x+H*.7&&b.x1<column.x+H*7;
 if(!arrow&&!reaction)return false;
 let total=0,chip=0,bright=0,colored=0;
 for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,b.y1);y++)for(let x=Math.max(0,Math.floor(b.x0));x<Math.min(w,b.x1);x++){
  const c=rgb(p,w,x,y),hi=lum(c),lo=Math.min(...c);total++;if(lo>=34&&hi<=100&&hi-lo<25)chip++;if(lo>=180&&hi-lo<25)bright++;if(hi>=112&&hi-lo>35)colored++;
 }
 return total>0&&chip/total>.42&&bright/total<.06&&colored/total<.08;
}
/** Muted short suffix after bright body text. Require observed edited token
 * or smaller neutral ink geometry at the very end; do not rewrite text. */
function editedEdge(r,p,w,h,column){
 const b=r.bbox,H=b.y1-b.y0;let last=-1;const start=Math.max(0,Math.floor(column.x)),end=Math.min(w,Math.ceil(b.x1));
 if(!/\(edited\)\s*$/i.test(String(r.text||'')))return null;
 for(let x=start;x<end;x++)for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,b.y1);y++)if(Math.min(...rgb(p,w,x,y))>=180)last=x;
 if(last<start||end-last<H*.75||end-last>H*4)return null;
 return last+3;
}
/** Preserve candidates; only mark proven duplicate slivers and highlighted mentions. */
export function refineSemanticRows(rows,p,w,h,column){
 if(!column||!p||p.length!==w*h*4)return rows;
 const out=rows.map(r=>({...r}));const heights=out.filter(r=>r.kind==='body'&&!r.splitBody&&valid(r.bbox)).map(r=>r.bbox.y1-r.bbox.y0),typical=median(heights);
 for(const r of out){const b=r.bbox;if(!valid(b))continue;const H=b.y1-b.y0;
  if(['fragment','reply'].includes(r.kind)&&controlRegion(b,p,w,h,column)){r.kind='graphic';r.reason='ปุ่มควบคุมหรือ Reaction ที่สงสัย';continue;}
  if(['body','fragment','header','mixed','reply'].includes(r.kind)&&!r.replyContinuation&&hasMentionBackground(b,p,w,h,column)&&!mixedMentionContainer(r,out,p,w,h,column)){r.kind='body';r.mention=true;r.layoutHeader=false;r.nameROI=null;r.nameEvidence=null;r.reason='Mention ในเนื้อหา ไม่ใช่หัวข้อความหรือ Reply';}
  else if(r.kind==='reply'&&!r.replyContinuation){const left=replyTextLeft(b,p,w,h,column);if(left!==null)r.textLeft=left;}

  if(['body','fragment'].includes(r.kind)){
   const bullet=bulletRegion(b,p,w,h,column);if(bullet){r.bullet=true;r.textLeft=bullet.x0;}
   const edited=editedEdge(r,p,w,h,column);if(edited!==null){r.edited=true;r.textRight=edited;}
   if(r.splitBody&&typical&&H<typical*.85){const candidates=out.filter(q=>q!==r&&!q.splitBody&&['body','fragment'].includes(q.kind)&&valid(q.bbox)&&q.bbox.y1-q.bbox.y0>H*1.12&&span(b,q.bbox)>=H*.4&&q.bbox.x1>column.x&&q.bbox.x0<=column.x+typical*.6);
    if(candidates.length===1){const q=candidates[0].bbox;let extra=0;
     for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,b.y1);y++)for(let x=Math.max(0,Math.floor(column.x));x<Math.min(w,b.x1);x++)if((x<q.x0-8||x>q.x1+8||y<q.y0-8||y>q.y1+8)&&ink(p,w,x,y))extra++;
     if(extra<4){r.kind='covered';r.reason='กรอบบางซ้อนบรรทัดจริง (ตรวจได้)';}
    }
   }
  }
 }
 // A recovery strip can be suppressed only by a distinct standalone mention
 // covering the same physical line, with no extra text-side ink. Do not
 // suppress a row solely because its text resembles another mention.
 for(const r of out){if(!r.splitBody||r.kind!=='body'||!valid(r.bbox))continue;const b=r.bbox;
  const q=out.filter(x=>x!==r&&!x.splitBody&&x.kind==='body'&&x.mention&&valid(x.bbox)&&span(b,x.bbox)>=.75*Math.min(b.y1-b.y0,x.bbox.y1-x.bbox.y0)&&x.bbox.x1>=b.x1-12);
  if(q.length!==1)continue;
  const a=q[0].bbox;let inside=0,extra=0;
  for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,Math.ceil(b.y1));y++)for(let x=Math.max(0,Math.floor(column.x-5));x<Math.min(w,Math.ceil(b.x1));x++){
   if(lum(rgb(p,w,x,y))<95)continue;
   if(x<a.x0-5||x>=a.x1+5||y<a.y0-5||y>=a.y1+5)extra++;else inside++;
  }
  if(inside>=12&&!extra){r.kind='covered';r.reason='กรอบซ้ำของ Mention (ตรวจพิกเซลแล้ว)';}
 }
 // A clipped recovery sliver is not a second spoken line. Compare its actual
 // text-side ink with one taller overlapping row; preserve the raw candidate.
 for(const r of out){
  if(!r.splitBody||r.kind!=='body'||r.mention||!valid(r.bbox))continue;
  const b=r.bbox,H=b.y1-b.y0;
  const candidates=out.filter(q=>q!==r&&['body','fragment'].includes(q.kind)&&!q.mention&&valid(q.bbox)&&q.bbox.y1-q.bbox.y0>=H*1.12&&span(b,q.bbox)>=H*.55&&q.bbox.x0<=column.x+H*.5&&q.bbox.x1>=column.x+4);
  if(candidates.length!==1)continue;
  const q=candidates[0].bbox;let inside=0,extra=0;
  for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,Math.ceil(b.y1));y++)for(let x=Math.max(0,Math.floor(column.x-4));x<Math.min(w,Math.ceil(b.x1));x++)if(ink(p,w,x,y)){
   if(x<q.x0-4||x>=q.x1+4||y<q.y0-4||y>=q.y1+4)extra++;else inside++;
  }
  if(inside>=8&&extra<4){r.kind='covered';r.reason='กรอบย่อยซ้อนข้อความจริง (ตรวจสอบได้)';}
 }
 // Preserve clear paragraph spacing; no effect on distinct message headers.
 let prev=null;for(const r of out){if(['header','mixed','date','reply'].includes(r.kind)){prev=null;continue;}if(!['body','fragment'].includes(r.kind)||!valid(r.bbox))continue;
  if(prev&&typical&&r.bbox.y0-prev.bbox.y1>typical*.95&&r.bbox.y0-prev.bbox.y1<typical*3&&Math.abs(r.bbox.x0-column.x)<typical*.55)r.paragraphBefore=true;
  prev=r;
 }
 return out;
}
