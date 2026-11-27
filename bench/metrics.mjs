/**
 * Local-only OCR evaluation. Do not treat OCR confidence as text accuracy.
 * All character comparisons use Unicode grapheme clusters, not UTF-16 units.
 */
export function normalizeForComparison(value, { ignoreWhitespace = false } = {}) {
  let text=String(value ?? '').normalize('NFC').replace(/\u0E4D\u0E32/g, '\u0E33');
  text=text.replace(/\r\n?/g, '\n');
  if(ignoreWhitespace) return text.replace(/\s+/gu, '');
  return text.replace(/[\t ]+/g, ' ').replace(/ *\n */g,'\n').trim();
}
export function graphemes(text) {
  if(typeof Intl!=='undefined' && typeof Intl.Segmenter==='function')
    return Array.from(new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text),p=>p.segment);
  return Array.from(text); // explicit fallback: code points, not UTF-16 code units
}
export function editDistance(a,b){
  if(a.length>b.length) [a,b]=[b,a];
  let prev=Array.from({length:a.length+1},(_,i)=>i);
  for(let i=1;i<=b.length;i++) {
    const next=[i];
    for(let j=1;j<=a.length;j++) next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[j-1]===b[i-1]?0:1));
    prev=next;
  }
  return prev[a.length];
}
export function evaluateText(reference,recognized) {
  if(!String(reference??'').trim())return null;
  const strictRef=graphemes(normalizeForComparison(reference));
  const strictHyp=graphemes(normalizeForComparison(recognized));
  const compactRef=graphemes(normalizeForComparison(reference,{ignoreWhitespace:true}));
  const compactHyp=graphemes(normalizeForComparison(recognized,{ignoreWhitespace:true}));
  const strictEdits=editDistance(strictRef,strictHyp);
  const compactEdits=editDistance(compactRef,compactHyp);
  return {
    referenceGraphemes:strictRef.length,
    recognizedGraphemes:strictHyp.length,
    strictEdits,
    strictCer:strictRef.length?strictEdits/strictRef.length:null,
    compactEdits,
    compactCer:compactRef.length?compactEdits/compactRef.length:null,
    note:'CER measures edit distance per reference grapheme. Values above 100% are possible; it does not assess speaker or message attribution.'
  };
}
export function evaluateAlignedSamples(samples){
  const rows=(samples||[]).map(s=>({id:String(s.id),result:evaluateText(s.reference,s.recognized)}));
  let edits=0,characters=0,compactEdits=0,compactChars=0;
  for(let i=0;i<samples.length;i++){
    if(!rows[i].result)continue;
    const r=rows[i].result;
    edits+=r.strictEdits;characters+=r.referenceGraphemes;
    compactEdits+=r.compactEdits;
    compactChars+=graphemes(normalizeForComparison(samples[i].reference,{ignoreWhitespace:true})).length;
  }
  return {rows,summary:{samples:rows.length,referenceGraphemes:characters,strictEdits:edits,strictCer:characters?edits/characters:null,compactEdits,compactCer:compactChars?compactEdits/compactChars:null}};
}
