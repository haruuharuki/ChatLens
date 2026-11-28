/** E.3.1: bounded local contrast experiment. No dictionary correction. */
import {thaiMarkDominates} from './region-output.mjs?v=e31';
const clean=s=>String(s??'').normalize('NFC').replace(/\u0e4d\u0e32/g,'\u0e33').trim();
const key=s=>clean(s).replace(/\s+/gu,'');
const skeleton=s=>key(s).replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/gu,'');
export function contrastRGBA(p,w,h){
 if(p.length!==w*h*4)throw new RangeError('invalid RGBA');
 const out=new Uint8ClampedArray(p.length),hist=new Uint32Array(256);
 for(let i=0;i<p.length;i+=4)hist[Math.max(p[i],p[i+1],p[i+2])]++;
 const quantile=f=>{let n=0;for(let j=0;j<256;j++){n+=hist[j];if(n>=w*h*f)return j;}return 255;};
 const low=quantile(.25),high=Math.max(low+48,quantile(.985));
 for(let i=0;i<p.length;i+=4){const v=Math.round(20+215*Math.max(0,Math.min(1,(Math.max(p[i],p[i+1],p[i+2])-low)/(high-low))));out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;}
 return out;
}
export function variantPriority(row,baseline,candidate,w,h){
 if(!['body','fragment','reply'].includes(row.kind)||row.mention||row.edgeClipped||row.omitEdge||row.replyIdentity||w<20||w>1500||h<15||h>100||!/[ก-ฮ]/u.test(baseline+candidate))return -1;
 const a=key(baseline),b=key(candidate);if(!a||!b)return -1;
 // Sample same-reading Thai rows too: agreement is not truth.
 return (a!==b?4:0)+(skeleton(a)===skeleton(b)?2:0)+(h<=50?2:0)+(/[-.!?…]$/.test(a)!==/[-.!?…]$/.test(b)?3:0);
}
export function selectVariantReading(current,original,baseline,candidate,variant){
 const c=clean(current),v=clean(variant?.open),t=clean(variant?.tess);if(!c||!v||!t)return c;
 const all=[c,clean(original),clean(baseline),clean(candidate),v,t].filter(Boolean);
 // Only adopt a richer complete observation with two variant engines agreeing
 // and no conflicting marks on the same base. No arbitrary base substitutions.
 if(key(v)===key(t)&&skeleton(v)===skeleton(c)&&thaiMarkDominates(key(v),key(c))&&all.filter(a=>skeleton(a)===skeleton(c)).every(a=>key(a)===key(v)||thaiMarkDominates(key(v),key(a))))return v;
 // Recover a terminal/leading punctuation mark only when two independent
 // observed readings support the same complete string, with unchanged glyphs.
 const strip=s=>key(s).replace(/^[.!?…]|[.!?…,:;~–—-]$/gu,'');
 const mark=s=>key(s).match(/^[.!?…]|[.!?…,:;~–—-]$/gu)?.join('')||'';
 if(!mark(c)&&strip(v)===key(c)&&mark(v)&&all.filter(a=>key(a)===key(v)).length>=2)return v;
 if(!mark(c)&&strip(t)===key(c)&&mark(t)&&all.filter(a=>key(a)===key(t)).length>=2)return t;
 // An observed inline bullet may replace an OCR lookalike only when the
 // surrounding complete text agrees and two independent readings saw •.
 const bulletKey=s=>key(s).replace(/[•»]/gu,'•');
 if(!c.includes('•')&&c.includes('»')&&v.includes('•')&&key(v)===key(t)&&bulletKey(v)===bulletKey(c))return v;
 return c;
}
