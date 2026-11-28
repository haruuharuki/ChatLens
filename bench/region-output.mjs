/** D.2b: resolve competing OCR readings without reconstructing missing words.
 * Geometry establishes physical identity; text similarity alone never deletes a row.
 */
const norm=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu,'');
const thai=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').replace(/[^\u0e01-\u0e5b]/g,'');
const latin=s=>(String(s??'').match(/[A-Za-z]{2,}(?:[-_][A-Za-z]{2,})*/g)||[]).map(x=>x.toLowerCase());
function similarity(a,b){
 const x=Array.from(a),y=Array.from(b);if(!x.length||!y.length)return 0;
 if(x.length>1200||y.length>1200)return 0;
 let p=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){const q=[i];for(let j=1;j<=y.length;j++)q[j]=Math.min(q[j-1]+1,p[j]+1,p[j-1]+(x[i-1]===y[j-1]?0:1));p=q;}
 return 1-p[y.length]/Math.max(x.length,y.length);
}
const closeText=(a,b)=>{const x=norm(a),y=norm(b);return !!x&&!!y&&(x===y||Math.min(x.length,y.length)>=4&&similarity(x,y)>=.72);};
// Compare complete observed readings, not a generated spelling. Only Thai
// combining marks may differ; spaces and punctuation otherwise stay intact.
const markOnly=/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/u;
const spelling=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').trim();
function spellingUnits(s){const out=[];for(const ch of spelling(s)){if(markOnly.test(ch)&&out.length&&/[\u0e01-\u0e2e]/u.test(out.at(-1).base))out.at(-1).marks+=ch;else out.push({base:ch,marks:''});}return out;}
export function thaiMarkDominates(a,b){
 const x=spellingUnits(a),y=spellingUnits(b);if(x.length!==y.length||!x.length||x.some((u,i)=>u.base!==y[i].base))return false;
 let added=0;for(let i=0;i<x.length;i++){if(x[i].marks===y[i].marks)continue;if(y[i].marks||!x[i].marks)return false;added++;}return added>0;
}
export function observedMarkReading(candidate,baseline,original=baseline){
 const readings=[candidate,baseline,original].map(spelling).filter(Boolean);
 const unique=[...new Set(readings)];
 // A richer reading must agree with at least one other observation on every
 // base glyph, and must not contradict any same-base competing mark.
 const sameBase=(a,b)=>{const x=spellingUnits(a),y=spellingUnits(b);return x.length===y.length&&x.every((u,i)=>u.base===y[i].base);};
 const choice=unique.filter(a=>thaiMarkDominates(a,candidate)&&unique.filter(b=>sameBase(a,b)).every(b=>a===b||thaiMarkDominates(a,b)));
 return choice.length===1?choice[0]:candidate;
}
function shortCorroboratedFragment(c,b,o){
 const x=spelling(c),y=spelling(b);if(y!==spelling(o)||!/^\p{Script=Thai}+$/u.test(y)||!/^\p{Script=Thai}+$/u.test(x))return false;
 const a=spellingUnits(x),d=spellingUnits(y);return a.length===d.length&&d.length>=3&&d.length<=6&&a.filter((u,i)=>u.base!==d[i].base).length===1&&a.every((u,i)=>u.marks===d[i].marks);
}
/** Prefer an intact observed reading only when a corroborated Latin word was lost
 * and the surrounding Thai text still agrees. Never splice or translate words. */
export function selectBilingualText(candidate,baseline,original=baseline,{shortFragment=false}={}){
 const c=String(candidate??'').trim(),b=String(baseline??'').trim();
 if(!c)return b;if(!b)return c;
 // Structured dice notation is a real observed mixed token, not a dictionary
 // correction. Require the same digit sequence and otherwise similar text.
 const dice=s=>[...s.matchAll(/(?<![\p{L}\p{N}])\d{1,3}[dD]\d{1,4}(?![\p{L}\p{N}])/gu)].map(m=>m[0]);
 const diceDigits=s=>s.match(/\d+/g)?.join('|')||'';
 const dc=dice(c),db=dice(b);
 if(dc.length!==db.length&&diceDigits(c)===diceDigits(b)&&diceDigits(c)&&closeText(c,b))return dc.length>db.length?c:b;
 // Punctuation seen in two passes should survive a dropped boundary mark.
 // Choose a complete observed reading, not a guessed character.
 const marker=s=>s.match(/^[.!?]|[.!?–—-]$/g)?.join('')||'';
 if(marker(b)&&marker(b)===marker(String(original).trim())&&!marker(c)&&norm(b)===norm(c))return b;
 const bt=latin(b),ct=latin(c),ot=latin(original);
 // Edge-only Latin noise is common when an avatar/emoji is in a Thai crop.
 // Preserve mixed tokens only when they are between Thai text, or the other
 // engine already sees Latin as well. Pure English keeps the old rule.
 const interior=latin(b.match(/[\u0e01-\u0e5b].*[\u0e01-\u0e5b]/u)?.[0]||'');
 const missing=bt.filter(t=>!ct.includes(t)&&ot.includes(t)&&(!thai(b)||ct.length||interior.includes(t)));
 if(!missing.length){const marked=observedMarkReading(c,b,original);if(marked!==c)return marked;return shortFragment&&shortCorroboratedFragment(c,b,original)?b:c;}
 const tb=thai(b),tc=thai(c);
 if(tb.length>=2&&tc.length>=2&&similarity(tb,tc)>=.65)return b;
 if(!tb&&bt.length&&!ct.length&&norm(b)===norm(original))return b;
 return c;
}
const boxOK=b=>b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0;
const overlap=(a0,a1,b0,b1)=>Math.max(0,Math.min(a1,b1)-Math.max(a0,b0));
export function sameBodyRegion(a,b,ta,tb){
 if(!boxOK(a)||!boxOK(b))return false;
 const aw=a.x1-a.x0,bw=b.x1-b.x0,ah=a.y1-a.y0,bh=b.y1-b.y0;
 const xo=overlap(a.x0,a.x1,b.x0,b.x1),yo=overlap(a.y0,a.y1,b.y0,b.y1);
 if(yo<.65*Math.min(ah,bh)||Math.min(ah,bh)<.60*Math.max(ah,bh)||xo<.65*Math.min(aw,bw))return false;
 // A much wider box may include extra content: demand corroboration before suppressing it.
 return Math.min(aw,bw)>=.72*Math.max(aw,bw)||closeText(ta,tb);
}
// Compare observed alternatives only. If the base letters agree exactly,
// prefer an otherwise identical reading with a missing Thai mark restored
// ONLY when another OCR reading supports that mark in its local context.
const thaiMark=/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/u;
function markUnits(text){
 const units=[];
 for(const ch of norm(text)){
  if(thaiMark.test(ch)&&units.length)units.at(-1).marks+=ch;
  else units.push({base:ch,marks:''});
 }
 return units;
}
function markPreference(a,b,readText){
 const x=markUnits(readText(a,a.kind||'fragment')),y=markUnits(readText(b,b.kind||'fragment'));
 if(x.length<4||x.length!==y.length||x.some((u,i)=>u.base!==y[i].base))return 0;
 function supports(r,units,i){
  const from=Math.max(0,i-2),to=Math.min(units.length,i+3);
  const token=units.slice(from,to).map(u=>u.base+u.marks).join('');
  // A different engine must have observed the same local glyph sequence.
  return to-from>=3 && !r.error && norm(r.candidate)===norm(readText(r,r.kind||'fragment')) && norm(r.baseline).includes(token);
 }
 function dominates(r,u,v){
  let added=0;
  for(let i=0;i<u.length;i++){
   if(u[i].marks===v[i].marks)continue;
   if(v[i].marks||!u[i].marks||!supports(r,u,i))return false;
   added++;
  }
  return added>0;
 }
 if(dominates(a,x,y))return 1;if(dominates(b,y,x))return -1;return 0;
}
function observations(r,readText){return [readText(r,r.kind||'fragment'),r.baseline,r.originalText??r.text].filter(t=>norm(t));}
function sameObservedRegion(a,b,readText){
 // Geometry is still mandatory; a garbled preferred reading must not defeat
 // corroboration from the other observed reading of the same two regions.
 return observations(a,readText).some(x=>observations(b,readText).some(y=>sameBodyRegion(region(a),region(b),x,y)));
}
const bodyKind=r=>['body','fragment'].includes(r.kind||'fragment');
const region=r=>r.sourceBodyBox||r.bbox;
/** Leave source rows intact for Benchmark; only select the transcript's rows. */
export function resolveBodyRows(rows,readText){
 const keep=[],group=[];let suppressed=0;
 const rank=r=>(String(r.truth??'').trim()?100:0)+(r.candidate&&!r.error?10:0)+(r.splitBody?0:3)+(r.kind==='body'?1:0);
 const flush=()=>{
  const selected=[];
  for(const r of group){const t=readText(r,r.kind||'fragment');if(!norm(t)){selected.push(r);continue;}
   const matches=selected.map((p,i)=>({p,i})).filter(({p})=>norm(readText(p,p.kind||'fragment'))&&sameObservedRegion(p,r,readText));
   // Never bridge two separate physical rows through an ambiguous large box.
   if(matches.length!==1){selected.push(r);continue;}
   const {p,i}=matches[0];
   const manualR=Boolean(String(r.truth??'').trim()),manualP=Boolean(String(p.truth??'').trim());
   const mark=(!manualR&&!manualP)?markPreference(r,p,readText):0;
   if(mark>0||(mark===0&&rank(r)>rank(p)))selected[i]=r;
   suppressed++;
  }
  keep.push(...selected.sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0));group.length=0;
 };
 for(const r of rows){if(bodyKind(r))group.push(r);else if(['covered','graphic'].includes(r.kind)){keep.push(r);}else{flush();keep.push(r);}}flush();
 keep.sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
 return {rows:keep,suppressed};
}
/** A header tail is a fallback, not a second body. Only suppress it when a
 * dedicated body overlaps the original source rectangle AND text agrees. */
export function hasBodyAlternative(rows,index,source,text,readText){
 if(!boxOK(source)||!norm(text))return false;
 for(let i=index+1;i<rows.length;i++){
  const r=rows[i],kind=r.kind||'fragment';
  if(['header','mixed','date','reply'].includes(kind))break;
  if(!bodyKind(r))continue;
  const b=region(r);if(!boxOK(b))continue;
  if(b.y0>=source.y1)break;
  const yo=overlap(source.y0,source.y1,b.y0,b.y1),xo=overlap(source.x0,source.x1,b.x0,b.x1);
  if(yo>=.60*(b.y1-b.y0)&&xo>=.65*Math.min(source.x1-source.x0,b.x1-b.x0)&&closeText(text,readText(r,kind)))return true;
 }
 return false;
}
