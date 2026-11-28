/** Same visible username pixels, not account identity. Local and per image. */
import {parseHeader,chooseHeaderReading} from './text-transcript.mjs?v=d3abc';
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
 return out;
}
/** Keep independent readings; never elevate a scaled crop just because the box is valid. */
function localChoice(row,head,obs){
 const by=s=>obs.find(x=>x.source===s)?.name;
 const full=obs.filter(x=>['full','nearby','baseline'].includes(x.source));
 const tight=obs.filter(x=>['native','scaled'].includes(x.source));
 const native=by('native'),scaled=by('scaled');
 if(latinName(head.speaker)&&full.some(f=>f.name===head.speaker)&&!tight.some(t=>t.name===head.speaker))return {speaker:head.speaker,reason:'preserve-observed-bilingual',uncertain:true};
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
  const r=out[i];if(!['header','mixed'].includes(r.kind)||!r.nameEvidence||!r.nameROI)continue;
  const head=chooseHeaderReading(r,r.originalText??r.text);if(!head)continue;
  const obs=observations(r,head),choice=localChoice(r,head,obs);
  const record={i,r,head,obs,choice};records.push(record);
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
  // Reuse an observed exact name only when local decisions agree, never fill
  // a dissenting record merely because it has the same color or width.
  const same=group.every(r=>r.choice.speaker===group[0].choice.speaker);
  if(same)for(const r of group)r.choice={...r.choice,reason:'identical-pixels-agree'};
 }
 for(const r of records)out[r.i].nameResolution={...r.choice,time:r.head.time,date:r.head.date};
 return out;
}
