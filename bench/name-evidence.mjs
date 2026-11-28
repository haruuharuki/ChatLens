/** Same visible username pixels, not account identity. Local and per image. */
import {parseHeader,chooseHeaderReading} from './text-transcript.mjs?v=e3';
import {thaiMarkDominates} from './region-output.mjs?v=e3';
const clean=s=>String(s??'').normalize('NFC').replace(/\s+/g,' ').trim();
const valid=b=>b&&['x0','x1','y0','y1'].every(k=>Number.isInteger(b[k]))&&b.x1>b.x0&&b.y1>b.y0;
export function identicalNamePixels(a,b,p,w,h){
 if(!valid(a)||!valid(b)||!p||p.length!==w*h*4)return false;
 const W=a.x1-a.x0,H=a.y1-a.y0;
 if(W!==b.x1-b.x0||H!==b.y1-b.y0||W<12||H<12||W>1000||H>100)return false;
 if([a,b].some(q=>q.x0<0||q.y0<0||q.x1>w||q.y1>h))return false;
 // Independent name occurrences only, except the same region used by a cache.
 let ink=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=((a.y0+y)*w+a.x0+x)*4,j=((b.y0+y)*w+b.x0+x)*4;
  if(p[i]!==p[j]||p[i+1]!==p[j+1]||p[i+2]!==p[j+2]||p[i+3]!==p[j+3])return false;
  const hi=Math.max(p[i],p[i+1],p[i+2]),lo=Math.min(p[i],p[i+1],p[i+2]);if(hi>=112&&hi-lo>=35)ink++;
 }
 return ink>=24;
}
const nameOK=s=>s.length>=2&&s.length<=90&&/\p{L}/u.test(s)&&!/[<>@{}]/u.test(s);
const prefix=s=>s.match(/^(?:\[(\d{1,4})\]|\((\d{1,4})\)|(\d{1,4})\s*\|)/u)?.[0].replace(/\s/g,'')||'';
const latinName=s=>s.match(/^(\[\d{1,4}\]|\(\d{1,4}\))\s*([A-Za-z]{2,}(?:[-_][A-Za-z]{2,})*)\s*\|\s*([\u0e01-\u0e5b][^|]*)$/u);
const suffix=s=>clean(s.split('|').at(-1));
function observations(r,head){
 const e=r.nameEvidence||{},out=[];
 const add=(s,source)=>{s=clean(s);if(nameOK(s))out.push({name:s,source});};
 for(const [raw,source] of [[e.full,'full'],[e.nearby,'nearby'],[r.kind==='header'?r.baseline:'','baseline']]){
  const h=parseHeader(raw,r.kind);if(h&&h.time===head.time&&(!h.date||!head.date||h.date===head.date)&&!h.tail)add(h.speaker,source);
 }
 for(const [raw,source] of [[e.native,'native'],[e.scaled,'scaled']])if(!parseHeader(raw,'header'))add(raw,source);
 // For a visually isolated badge, compare a complete observed prefix of the
 // timed row against the isolated name. Do not strip arbitrary final words.
 // A whitespace boundary AND mark-only agreement are mandatory.
 if(e.badge&&nameOK(clean(e.native))&&!parseHeader(e.native,'header')){
  for(const [raw,source] of [[e.full,'full-prefix'],[e.nearby,'nearby-prefix'],[r.baseline,'baseline-prefix']]){
   const h=parseHeader(raw,r.kind);if(!h||h.time!==head.time||h.date!==head.date||h.tail)continue;
   const words=clean(h.speaker).split(' ');for(let i=1;i<=words.length;i++){
    const n=words.slice(0,i).join(' ');if(thaiMarkDominates(n,clean(e.native)))add(n,source);
   }
  }
 }
 if(r.kind==='header'&&!r.error){
  const h=parseHeader(r.candidate,'header');if(h&&h.time===head.time&&h.date===head.date&&!h.tail)add(h.speaker,'open-full');
 }
 if(!parseHeader(r.nameOpenThai,'header'))add(r.nameOpenThai,'open-name');
 return out;
}
/** Select an entire observed spelling, not a reconstructed name. OpenThai
 * cannot override a different base glyph, structured prefix, or conflicting mark. */
export function corroboratedName(current,obs){
 const base=clean(current);if(!nameOK(base))return null;
 const skeleton=n=>clean(n).replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/gu,'');
 const compatible=n=>skeleton(n)===skeleton(base);
 const options=[...new Set(obs.map(o=>o.name))].filter(n=>thaiMarkDominates(n,base));
 const choices=options.filter(n=>{
  const evidence=obs.filter(o=>o.name===n),open=evidence.some(o=>o.source==='open-name'),
   other=evidence.some(o=>o.source!=='open-name');
  // Isolated OpenThai plus a complete observed full-row/crop reading. A
  // contradictory mark on the same base glyph vetoes the enhancement.
  return open&&other&&obs.filter(o=>compatible(o.name)||thaiMarkDominates(o.name,base)).every(o=>o.name===n||thaiMarkDominates(n,o.name));
 });
 return choices.length===1?choices[0]:null;
}
/** Keep independent readings; never elevate a scaled crop just because the box is valid. */
function localChoice(row,head,obs){
 const by=s=>obs.find(x=>x.source===s)?.name;
 const full=obs.filter(x=>['full','nearby','baseline'].includes(x.source));
 const tight=obs.filter(x=>['native','scaled'].includes(x.source));
 const native=by('native'),scaled=by('scaled');
 const richer=[...new Set(obs.map(o=>o.name))].filter(n=>(thaiMarkDominates(n,head.speaker)||native&&thaiMarkDominates(n,native)&&prefix(native)===prefix(head.speaker))&&obs.filter(o=>o.name===n).length>=2);
 if(richer.length===1)return {speaker:richer[0],reason:'corroborated-thai-marks',uncertain:true};
 if(latinName(head.speaker)&&full.some(f=>f.name===head.speaker)&&!tight.some(t=>t.name===head.speaker))return {speaker:head.speaker,reason:'preserve-observed-bilingual',uncertain:true};
 // A complete isolated name agreed by both crops can remove a leading
 // avatar artifact, but never discard a structured numeric prefix.
 if(native&&native===scaled&&!prefix(head.speaker)&&full.some(f=>f.name===native||f.name.endsWith(' '+native))&&
    full.every(f=>!prefix(f.name)||prefix(f.name)===prefix(native)))return {speaker:native,reason:'isolated-name-agreement',uncertain:full.some(f=>f.name!==native)};
 // A structured native name can be corroborated by independent full rows
 // even if OCR drops a space next to the separator or reads a tiny numeric
 // avatar artifact before a bracket. Preserve the isolated observed spelling.
 const pipeKey=s=>clean(s).replace(/\s*\|\s*/g,'|');
 if(native&&prefix(native)&&/^[[(]/.test(native)){
  const key=pipeKey(native),support=full.filter(f=>pipeKey(f.name)===key||pipeKey(f.name.replace(/^\d{1,2}\s+(?=[[(]\d)/u,''))===key);
  if(support.length>=2&&!full.some(f=>prefix(f.name)&&prefix(f.name)!==prefix(native)))return {speaker:native,reason:'structured-native-corroborated',uncertain:scaled!==native};
 }
 const backed=tight.filter(t=>full.some(f=>f.name===t.name||f.name.startsWith(t.name+' ')));
 if(backed.length&&backed.every(t=>t.name===backed[0].name))return {speaker:backed[0].name,reason:'name-corroborated',uncertain:false};
 // A geometrically detected badge is not a license to remove arbitrary words.
 // A native isolated reading can be preferred if it preserves a structured prefix
 // seen in the full row; keep it explicitly uncertain on disagreement.
 if(native&&prefix(native)&&full.some(f=>prefix(f.name)===prefix(native))&&(!scaled||prefix(scaled)!==prefix(native)))return {speaker:native,reason:'native-prefix',uncertain:true};
 if(!row.nameEvidence?.badge){
  const structured=full.filter(f=>prefix(f.name));
  if(structured.length&&structured.every(f=>prefix(f.name)===prefix(structured[0].name))&&!prefix(head.speaker))return {speaker:structured[0].name,reason:'preserve-full-prefix',uncertain:true};
  const agreed=full.find(f=>full.filter(g=>g.name===f.name).length>=2);
  if(agreed&&agreed.name!==head.speaker)return {speaker:agreed.name,reason:'preserve-full',uncertain:!tight.some(t=>t.name===agreed.name)};
 }
 return {speaker:head.speaker,reason:'existing-observation',uncertain:new Set(obs.map(o=>o.name)).size>1};
}
export function resolveNameEvidence(rows,p,w,h){
 const records=[];const out=rows.map(r=>({...r}));
 for(let i=0;i<out.length;i++){
  const r=out[i];if(!['header','mixed'].includes(r.kind)||!r.nameEvidence||!r.nameROI||r.clippedName)continue;
  const head=chooseHeaderReading(r,r.originalText??r.text);if(!head)continue;
  const allObs=observations(r,head),obs=allObs.filter(o=>!o.source.startsWith('open-')),choice=localChoice(r,head,obs);
  const record={i,r,head,obs,allObs,choice};records.push(record);
 }
 // Exact equality is transitive. No nearest-neighbor links or fuzzy merging.
 const groups=[];
 for(const rec of records){
  const group=groups.find(g=>identicalNamePixels(g[0].r.nameROI,rec.r.nameROI,p,w,h));
  if(group)group.push(rec);else groups.push([rec]);
 }
 for(const group of groups){
  if(group.length<2)continue;
  const all=group.flatMap(r=>r.obs);
  const options=[...new Set(all.map(o=>o.name).filter(n=>latinName(n)))];
  // Preserve a unique observed structured bilingual name, only if the same
  // prefix and Thai suffix are independently visible in another occurrence's
  // full-row reading. Conflicting Latin names or structured prefixes veto it.
  if(options.length===1){
   const n=options[0],m=latinName(n);
   const support=group.filter(r=>r.obs.some(o=>['full','nearby','baseline'].includes(o.source)&&prefix(o.name)===prefix(n)&&suffix(o.name)===clean(m[3])));
   const conflict=all.some(o=>prefix(o.name)&&prefix(o.name)!==prefix(n));
   if(support.length>=2&&!conflict){for(const r of group)r.choice={speaker:n,reason:'identical-pixels-bilingual',uncertain:true};continue;}
  }
  // Exact pixel equality permits pooling independent complete header reads.
  // Cached native/scaled crops are not repeated votes. A single clean Latin
  // full-row baseline may disambiguate a near-conflicting isolated reading,
  // but never override a different prefix or Thai suffix.
  const fullLatin=[...new Set(all.filter(o=>o.source==='baseline'&&latinName(o.name)).map(o=>o.name))];
  if(fullLatin.length===1&&options.length>1){
   const n=fullLatin[0],m=latinName(n),peers=options.map(latinName);
   const near=(a,b)=>a.length===b.length&&Array.from(a).filter((c,i)=>c!==b[i]).length<=1;
   if(peers.every(q=>q[1]===m[1]&&q[3]===m[3]&&near(q[2],m[2]))&&group.some(r=>r.choice.speaker===n)){
    for(const r of group)r.choice={speaker:n,reason:'identical-pixels-full-row-observation',uncertain:true};continue;
   }
  }
  // Reuse an observed exact name only when local decisions agree, never fill
  // a dissenting record merely because it has the same color or width.
  // Same pixels plus a unique complete name corroborated by a native crop
  // and full-row evidence across two occurrences can settle a disagreement.
  // Cached crop reads count only once; full rows are separate observations.
  const supported=[...new Set(all.map(o=>o.name))].filter(n=>
   group.some(r=>r.obs.some(o=>o.source==='native'&&o.name===n))&&
   group.filter(r=>r.obs.some(o=>['full','nearby','baseline'].includes(o.source)&&o.name===n)).length>=2);
  if(supported.length===1&&group.some(r=>r.choice.speaker!==supported[0])&&
     !all.some(o=>prefix(o.name)&&prefix(supported[0])&&prefix(o.name)!==prefix(supported[0]))){
   for(const r of group)r.choice={speaker:supported[0],reason:'identical-pixels-corroborated-name',uncertain:true};continue;
  }
  // A richer mark-only spelling must be observed in separate full rows.
  const marked=[...new Set(all.map(o=>o.name))].filter(n=>group.every(r=>r.choice.speaker===n||thaiMarkDominates(n,r.choice.speaker))&&group.filter(r=>r.obs.some(o=>['full','nearby','baseline','full-prefix','nearby-prefix','baseline-prefix'].includes(o.source)&&o.name===n)).length>=2);
  if(marked.length===1&&group.some(r=>r.choice.speaker!==marked[0])){for(const r of group)r.choice={speaker:marked[0],reason:'identical-pixels-thai-marks',uncertain:true};continue;}
  const same=group.every(r=>r.choice.speaker===group[0].choice.speaker);
  if(same)for(const r of group)r.choice={...r.choice,reason:'identical-pixels-agree'};
 }
 // Apply after existing same-image decisions so an uncorroborated new
 // recognizer cannot undo the previously working bilingual-name rule.
 for(const group of groups){
  const obs=group.flatMap(r=>r.allObs);
  const current=[...new Set(group.map(r=>r.choice.speaker))];
  if(current.length===1){const n=corroboratedName(current[0],obs);if(n)for(const r of group)r.choice={speaker:n,reason:'independent-name-mark-evidence',uncertain:true};}
  for(const r of group){out[r.i].nameResolution={...r.choice,time:r.head.time,date:r.head.date};out[r.i].nameObservations=r.allObs;}
 }
 for(const row of out){if(!row.replyIdentity||row.kind!=='reply')continue;
  const box=row.replyIdentity.headerBox,record=records.find(r=>['x0','x1','y0','y1'].every(k=>r.r.nameROI[k]===box[k]));
  if(record)row.replyNameResolution={speaker:record.choice.speaker,uncertain:true,reason:'unique-visible-reply-name-shape'};
 }
 return out;
}
