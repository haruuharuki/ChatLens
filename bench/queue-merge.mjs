// E.2: local-only, bounded evidence. No canvas, screenshot, filename or raw pixels
// survive the per-image read. Hashes are ephemeral and never enter safe reports.
import {formatTextTranscript} from './text-transcript.mjs?v=e3';
import {thaiMarkDominates} from './region-output.mjs?v=e3';
import {corroboratedName} from './name-evidence.mjs?v=e3';
const compact=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').replace(/\s+/gu,'');
const plain=s=>compact(s).replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/gu,'');
const valid=b=>b&&[b.x0,b.x1,b.y0,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0;
const box=b=>valid(b)?{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1}:null;
const hash=(h,v)=>Math.imul(h^v,16777619)>>>0;
// Two independent accumulators; ignore empty scanlines and right-side floating UI.
export function viewportEvidence(p,w,h,column){
 if(!p||p.length!==w*h*4||!column||w<100||h<100||h>4000)return null;
 const x0=Math.max(0,Math.floor(w*.15)),x1=Math.floor(w*.75),edge=Math.ceil(h*.66);
 const top=[],bottom=[];
 for(let y=0;y<h;y++){
  if(y>=edge&&y<h-edge)continue;
  let a=2166136261,b=0x9e3779b9,n=0;
  for(let x=x0;x<x1;x++){
   const i=(y*w+x)*4,on=Math.max(p[i],p[i+1],p[i+2])>=120;
   if(on){n++;a=hash(a,x-x0+1);b=(Math.imul(b,31)+(x-x0+1))>>>0;}
  }
  if(n<10)continue;
  const row=[y,a,b];if(y<edge)top.push(row);if(y>=h-edge)bottom.push(row);
 }
 return {w,h,top,bottom};
}
function uniqueRows(rows){const m=new Map();for(const [y,a,b] of rows){const k=a+':'+b;m.set(k,m.has(k)?null:y);}return m;}
export function findViewportOverlap(a,b){
 if(!a||!b||a.w!==b.w)return null;
 const x=uniqueRows(a.bottom),y=uniqueRows(b.top),votes=new Map();
 for(const [k,i] of x){const j=y.get(k);if(i==null||j==null)continue;const shift=i-j;
  if(Math.abs(shift)>=Math.max(a.h,b.h)-15)continue;
  if(!votes.has(shift))votes.set(shift,[]);votes.get(shift).push(i);
 }
 const ranked=[...votes].sort((a,b)=>b[1].length-a[1].length),best=ranked[0];if(!best)return null;
 const [shift,ys]=best,span=Math.max(...ys)-Math.min(...ys)+1;
 if(shift<=0||shift>=a.h-15||ys.length<24||span<20||ys.length/span<.10||ys.length<(ranked[1]?.[1].length??0)*1.65)return null;
 return {shift,support:ys.length,from:Math.min(...ys),to:Math.max(...ys),end:Math.min(a.h,shift+b.h),rows:ys};
}
// Exact same-size name glyph evidence, never fuzzy-match two similar names.
function nameKey(p,w,h,b){
 if(!p||!valid(b)||b.x0<0||b.y0<=2||b.x1>w||b.y1>=h-2||b.x1-b.x0>w*.65||b.y1-b.y0>100)return null;
 let l=w,r=0,t=h,d=0,n=0;
 const on=(x,y)=>{const i=(y*w+x)*4;return Math.max(p[i],p[i+1],p[i+2])>=105&&Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])>35;};
 for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)if(on(x,y)){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);d=Math.max(d,y);n++;}
 if(n<40||r-l<12||d-t<8)return null;
 let a=2166136261,c=0x9e3779b9;for(let y=t;y<=d;y++)for(let x=l;x<=r;x++){const i=(y*w+x)*4,v=on(x,y)?(p[i]<<16|p[i+1]<<8|p[i+2]):0;a=hash(a,v);c=(Math.imul(c,31)+v)>>>0;}
 return [r-l+1,d-t+1,n,a,c].join(':');
}
export function captureQueueEvidence(result,rows,p,w,h,column){
 const viewport=viewportEvidence(p,w,h,column);
 const entries=result.entries.map(e=>{
  if(e.dateMarker)return {dateMarker:e.dateMarker};
  const head=e.headerBox&&rows.find(r=>r.bbox?.y0===e.headerBox.y0&&r.bbox?.x0===e.headerBox.x0&&['header','mixed'].includes(r.kind));
  const lines=(e.sourceLines??[]).map(l=>({text:l.text,box:box(l.box),paragraph:!!l.paragraph,
   edge:!!l.edge||!!l.box&&(l.box.y0<=2||l.box.y1>=h-4),
   side:!!l.box&&l.box.x0>w*.82&&l.box.y0>h*.7&&l.box.x1-l.box.x0<w*.12}));
  return {speaker:e.speaker,time:e.time,date:e.date,reply:e.reply,body:e.body,uncertain:!!e.uncertain||!!head?.nameResolution?.uncertain,
   headerBox:box(e.headerBox),clippedName:!!head?.clippedName,nameObservations:head&&!head.clippedName?(head.nameObservations??[]):[],nameKey:head&&!head.clippedName?nameKey(p,w,h,head.nameROI):null,lines,
   atTop:!!lines[0]?.box&&lines[0].box.y0<h*.22,atBottom:!!lines.at(-1)?.box&&lines.at(-1).box.y1>h*.82};
 });
 return {viewport,entries};
}
function similarity(a,b){const x=Array.from(plain(a)),y=Array.from(plain(b));if(!x.length||!y.length||x.length>1200||y.length>1200)return 0;if(x.join('')===y.join(''))return 1;
 if(Math.min(x.length,y.length)<8)return 0;
 const dp=Array.from({length:y.length+1},(_,i)=>i);for(let i=1;i<=x.length;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=y.length;j++){const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(x[i-1]!==y[j-1]));prev=old;}}
 return 1-dp[y.length]/Math.max(x.length,y.length);
}
function aligned(a,b,shift){if(!a||!b)return false;const h=Math.min(a.y1-a.y0,b.y1-b.y0),dy=Math.min(a.y1,b.y1+shift)-Math.max(a.y0,b.y0+shift);return dy>=h*.60&&Math.abs(a.y0-b.y0-shift)<=Math.max(8,h*.65);}
function paired(a,b,overlap){
 if(a.date&&b.date&&a.date!==b.date||a.time&&b.time&&a.time!==b.time)return false;
 if(a.speaker&&b.speaker&&a.speaker!==b.speaker&&!a.uncertain&&!b.uncertain&&(!a.nameKey||a.nameKey!==b.nameKey))return false;
 return a.lines.some(x=>!x.side&&b.lines.some(y=>!y.side&&aligned(x.box,y.box,overlap.shift)&&similarity(x.text,y.text)>=.76&&overlap.rows.filter(v=>v>=x.box.y0&&v<x.box.y1).length>=4));
}
function joinMessage(a,b,o){
 const used=new Set(),out=[];let recovered=0;
 for(const x of a.lines){
  const i=b.lines.findIndex((y,i)=>!used.has(i)&&!x.side&&!y.side&&aligned(x.box,y.box,o.shift)&&similarity(x.text,y.text)>=.76);
  if(i>=0){used.add(i);const y=b.lines[i];
   // A boundary-obscured reading is replaced only by a matching complete line.
   const preferB=(a.atBottom&&!y.edge&&b.atTop)||(x.edge&&!y.edge);
   if(preferB&&x.text!==y.text)recovered++;
   out.push({... (preferB?y:x),box:x.box,paragraph:x.paragraph||y.paragraph});
  }else if(!(x.side&&a.atBottom&&b.atTop&&x.box.y0>=o.shift&&x.box.y1<=o.end)){out.push(x);}
 }
 for(let i=0;i<b.lines.length;i++)if(!used.has(i)){const y=b.lines[i];out.push({...y,box:y.box?{...y.box,y0:y.box.y0+o.shift,y1:y.box.y1+o.shift}:null});recovered++;}
 out.sort((x,y)=>(x.box?.y0??0)-(y.box?.y0??0));
 const body=out.map((l,i)=>(i&&l.paragraph?'\n':'')+l.text).join('\n');
 const author=(!a.speaker||a.clippedName)&&b.speaker||a.uncertain&&b.speaker&&!b.uncertain?b:a;
 // If a complete aligned header supersedes a clipped one, keep its observed
 // name evidence as well; never assume a spelling from body similarity alone.
 return {entry:{...a,speaker:author.speaker,time:a.time??b.time,date:a.date??b.date,reply:a.reply??b.reply,body,uncertain:author.uncertain,nameKey:author.nameKey,nameObservations:author.nameObservations,clippedName:author.clippedName,lines:out},recovered};
}
function unifyNames(results){
 const groups=new Map();for(const r of results)if(r.state==='done'&&r.records)for(const e of r.records.entries){if(!e.nameKey||!e.speaker)continue;if(!groups.has(e.nameKey))groups.set(e.nameKey,[]);groups.get(e.nameKey).push(e);}
 let count=0;for(const g of groups.values()){
  const reliable=[...new Set(g.filter(e=>!e.uncertain).map(e=>e.speaker))];if(reliable.length>1)continue;
  const spellings=[...new Set(g.map(e=>e.speaker))];
  let chosen=reliable[0];
  // All-uncertain groups may improve marks only with an actual independent
  // name observation and compatible base glyphs. Conflicting marks stay put.
  if(!chosen){const obs=g.flatMap(e=>e.nameObservations??[]);const candidates=[...new Set(spellings.map(n=>corroboratedName(n,obs)).filter(Boolean))];
   if(candidates.length===1&&spellings.every(n=>n===candidates[0]||thaiMarkDominates(candidates[0],n)))chosen=candidates[0];}
  if(!chosen)continue;
  for(const e of g)if(e.uncertain&&e.speaker!==chosen){e.speaker=chosen;count++;}
 }return count;
}
function formatEntries(entries){const out=[];let date=null;for(const e of entries){if(e.dateMarker){if(date!==e.dateMarker){out.push(e);date=e.dateMarker;}continue;}if(e.date&&e.date!==date){date=e.date;out.push({dateMarker:date});}out.push(e);}return formatTextTranscript({entries:out});}
/** Never bridge a failed/partial image. Unproven boundaries remain explicit. */
export function mergeQueueRecords(results){
 // Copy records before changing name decisions; queue reorder/refresh is pure.
 const local=results.map(r=>({...r,records:r.records?{...r.records,entries:r.records.entries.map(e=>({...e}))}:null}));
 const stats={overlaps:0,mergedMessages:0,recoveredLines:0,nameLinks:unifyNames(local),unresolved:0};
 const sections=[];let active=[],previous=null;
 const flush=()=>{if(active.length)sections.push(formatEntries(active));active=[];previous=null;};
 for(let i=0;i<local.length;i++){
  const r=local[i],records=r.records;
  if(r.state!=='done'||!records){flush();const labels={partial:'[ผลบางส่วน โปรดตรวจภาพ]',failed:'[อ่านภาพไม่สำเร็จ]',cancelled:'[หยุดก่อนอ่านครบ]',pending:'[ยังไม่ได้อ่าน]',reading:'[กำลังอ่าน]'};sections.push(`--- ภาพ ${i+1} ---\n`+(labels[r.state]??'')+(['done','partial'].includes(r.state)?'\n'+r.text:''));continue;}
  const next=records.entries.filter(e=>!e.dateMarker);
  if(!previous){active.push(...records.entries);previous={viewport:records.viewport,entries:next};continue;}
  const o=findViewportOverlap(previous.viewport,records.viewport);
  let k=0;if(o){for(let n=1;n<=Math.min(previous.entries.length,next.length);n++)if(previous.entries.slice(-n).every((e,j)=>paired(e,next[j],o)))k=n;}
  if(!k){stats.unresolved++;flush();sections.push(`[รอยต่อภาพ ${i} → ${i+1}: ยังยืนยันข้อความซ้อนไม่ได้]`);active.push(...records.entries);previous={viewport:records.viewport,entries:next};continue;}
  stats.overlaps++;stats.mergedMessages+=k;
  const old=previous.entries.slice(-k),merged=[];
  for(let j=0;j<k;j++){
   const a=old[j],b=next[j],idx=active.lastIndexOf(a.output??a),m=joinMessage(a.output??a,b,o);stats.recoveredLines+=m.recovered;
   // Rebase accumulated lines into the newest image's coordinate frame.
   m.entry.lines=m.entry.lines.map(l=>({...l,box:l.box?{...l.box,y0:l.box.y0-o.shift,y1:l.box.y1-o.shift}:null}));
   m.entry.atTop=b.atTop;m.entry.atBottom=b.atBottom;
   if(idx>=0)active[idx]=m.entry;
   merged.push({...b,output:m.entry});
  }
  // Date markers inside the new image are recreated from actual message dates.
  active.push(...next.slice(k));previous={viewport:records.viewport,entries:[...merged,...next.slice(k)]};
 }
 flush();return {text:sections.join('\n\n').trim(),...stats};
}
