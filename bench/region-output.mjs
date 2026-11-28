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
/** Prefer an intact observed reading only when a corroborated Latin word was lost
 * and the surrounding Thai text still agrees. Never splice or translate words. */
export function selectBilingualText(candidate,baseline,original=baseline){
 const c=String(candidate??'').trim(),b=String(baseline??'').trim();
 if(!c)return b;if(!b)return c;
 const bt=latin(b),ct=latin(c),ot=latin(original);
 const missing=bt.filter(t=>!ct.includes(t)&&ot.includes(t));
 if(!missing.length)return c;
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
const bodyKind=r=>['body','fragment'].includes(r.kind||'fragment');
const region=r=>r.sourceBodyBox||r.bbox;
/** Leave source rows intact for Benchmark; only select the transcript's rows. */
export function resolveBodyRows(rows,readText){
 const keep=[],group=[];let suppressed=0;
 const rank=r=>(String(r.truth??'').trim()?100:0)+(r.candidate&&!r.error?10:0)+(r.splitBody?0:3)+(r.kind==='body'?1:0);
 const flush=()=>{
  const selected=[];
  for(const r of group){const t=readText(r,r.kind||'fragment');if(!norm(t)){selected.push(r);continue;}
   const matches=selected.map((p,i)=>({p,i})).filter(({p})=>norm(readText(p,p.kind||'fragment'))&&sameBodyRegion(region(p),region(r),readText(p,p.kind||'fragment'),t));
   // Never bridge two separate physical rows through an ambiguous large box.
   if(matches.length!==1){selected.push(r);continue;}
   const {p,i}=matches[0];if(rank(r)>rank(p))selected[i]=r;suppressed++;
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
