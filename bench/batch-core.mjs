/**
 * Phase C: selection and visual comparison primitives.
 * Pure functions, no screenshots/network/storage. Does not decide which OCR is correct.
 */
import {graphemes,normalizeForComparison} from './metrics.mjs';

const CLOCK=/\b(?:0?[1-9]|1[0-2])[:.][0-5]\d\s*(?:AM|PM)\b/i;
const THAI=/[\u0E01-\u0E5B]/u;
export const MAX_BATCH_LINES=60;

/** Select a spatially distributed sample of body-text lines, or all lines. */
export function chooseBatchLines(lines,mode='sample12',max=MAX_BATCH_LINES){
 if(!Array.isArray(lines))return [];
 const valid=lines.map((line,index)=>({line,index})).filter(({line})=>line?.bbox&&String(line.text||'').trim());
 const body=valid.filter(({line})=>{
  if(line.kind && line.kind!=='body')return false;
  const text=String(line.text).trim();
  return THAI.test(text)&&graphemes(text).length>=7&&!CLOCK.test(text)&&!/^[@#]/u.test(text);
 });
 const candidates=mode==='all' ? valid : body;
 if(!['sample12','bodyall','all'].includes(mode))throw new Error('Unknown batch selection mode');
 const cap=Math.max(1,Math.min(MAX_BATCH_LINES,Math.floor(Number(max)||MAX_BATCH_LINES)));
 if(mode==='sample12'){
  const n=Math.min(12,cap,candidates.length);
  if(!n)return [];
  if(n===1)return [candidates[Math.floor((candidates.length-1)/2)]];
  return Array.from({length:n},(_,i)=>candidates[Math.round(i*(candidates.length-1)/(n-1))]);
 }
 return candidates.slice(0,cap);
}

export function normalizedEqual(left,right){
 return normalizeForComparison(left)===normalizeForComparison(right);
}

/** Returns matching/different grapheme runs on both sides, never guesses corrections. */
export function compareRuns(left,right){
 const a=graphemes(String(left??'').normalize('NFC'));
 const b=graphemes(String(right??'').normalize('NFC'));
 // Bound work for long/untrusted OCR lines; preserve exact texts but mark as distinct.
 if(a.length>360||b.length>360)return {left:[{text:a.join(''),changed:true}],right:[{text:b.join(''),changed:true}],identical:normalizedEqual(left,right)};
 const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
 for(let i=0;i<=n;i++)dp[i][0]=i;
 for(let j=0;j<=m;j++)dp[0][j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 }
 const pairs=[];let i=n,j=m;
 while(i||j){
  if(i&&j&&dp[i][j]===dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){
   pairs.push({l:a[--i],r:b[--j],changed:a[i]!==b[j]});
  }else if(i&&dp[i][j]===dp[i-1][j]+1){pairs.push({l:a[--i],r:'',changed:true});}
  else {pairs.push({l:'',r:b[--j],changed:true});}
 }
 pairs.reverse();
 function compress(side){const out=[];for(const p of pairs){const t=p[side];if(!t)continue;const prev=out.at(-1);if(prev&&prev.changed===p.changed)prev.text+=t;else out.push({text:t,changed:p.changed});}return out;}
 return {left:compress('l'),right:compress('r'),identical:normalizedEqual(left,right)};
}

/** Technical summary contains no OCR text, username, filenames or screenshots. */
export function safeBatchReport({detected,selected,completed,identical,different,failures,cancelled,tesseractMs,modelLoadMs,inferenceMs,withTruth=0,tesseractLineMs=0,flaggedNonBody=0}={}){
 const int=x=>Math.max(0,Math.round(Number(x)||0));
 return [
  'ChatLens Phase C — anonymized OCR diagnostic (line recognizer only)',
  `detected lines: ${int(detected)}`,
  `selected lines: ${int(selected)}`,
  `OpenThai completed: ${int(completed)}`,
  `identical outputs: ${int(identical)}`,
  `different outputs: ${int(different)}`,
  `failed lines: ${int(failures)}`,
  `cancelled: ${Boolean(cancelled)}`,
  `Tesseract full-image ms: ${int(tesseractMs)}`,
   `Tesseract focused-line extra ms: ${int(tesseractLineMs)}`,
   `flagged header/reply/fragment lines: ${int(flaggedNonBody)}`,
  `ONNX first model load ms: ${int(modelLoadMs)}`,
  `OpenThai total line inference ms: ${int(inferenceMs)}`,
  `lines with manually supplied ground truth: ${int(withTruth)}`,
  'No screenshot, file name, image pixel, chat text, user name, or ground truth included.'
 ].join('\n');
}
