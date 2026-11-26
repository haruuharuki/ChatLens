/**
 * Visual overlap detector for consecutive user-supplied screenshots.
 * Compares text pixels rather than OCR strings, which may differ across JPEG/PNG
 * or Thai recognition errors. The original screenshots are NEVER modified.
 *
 * A match is only a suggestion for *where to begin OCR in the NEXT screenshot*.
 * The app retains a small safety overlap, and lets users re-read images with
 * visual overlap detection disabled. Do not treat this as proof of completeness.
 */
export const VISUAL_WIDTH = 360;

export function lumaFromRGBA(data, width, height) {
  if (!data || data.length < width * height * 4) throw new Error('Invalid screenshot pixel data');
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    out[p] = Math.round(data[i] * .299 + data[i+1] * .587 + data[i+2] * .114);
  }
  return out;
}

function correlation(a, b, width, height, shift, yStart, patchHeight) {
  const xStart = Math.round(width * .18);
  const xEnd = Math.round(width * .87);
  let aa=0,bb=0,ab=0,a2=0,b2=0,n=0;
  for (let y=yStart; y<yStart+patchHeight; y+=3) {
    const aRow=(y+shift)*width, bRow=y*width;
    for (let x=xStart; x<xEnd; x+=4) {
      const av=a[aRow+x],bv=b[bRow+x];
      aa+=av; bb+=bv; a2+=av*av; b2+=bv*bv; ab+=av*bv; n++;
    }
  }
  if (n < 120) return -1;
  const va=a2-aa*aa/n, vb=b2-bb*bb/n;
  if (va < 9000 || vb < 9000) return -1; // reject uniform background
  return (ab-aa*bb/n) / Math.sqrt(va*vb);
}

/**
 * @param {{width:number,height:number,luma:Uint8Array}} previous
 * @param {{width:number,height:number,luma:Uint8Array}} next
 * @returns {null|{similarity:number,verify:number,shift:number,skipUntilRatio:number}}
 */
export function detectVisualOverlap(previous, next) {
  if (!previous || !next || previous.width !== next.width ||
      Math.abs(previous.height-next.height) > 7 || previous.width < 240 ||
      previous.height < 500) return null;
  const w=next.width,h=next.height;
  const a=previous.luma,b=next.luma;
  if (!a || !b || a.length < w*h || b.length < w*h) return null;
  const y0=Math.round(h*.165), patchHeight=Math.round(h*.105);
  const prevContentEnd=Math.round(h*.888);
  const minShift=Math.round(h*.09);
  const maxShift=prevContentEnd-y0-patchHeight;
  let best=-1, bestShift=-1;
  for (let shift=minShift;shift<=maxShift;shift++) {
    const val=correlation(a,b,w,h,shift,y0,patchHeight);
    if (val>best) { best=val;bestShift=shift; }
  }
  if (best < .88) return null;
  // A second, partially independent patch checks for coincidental matching.
  const verify=correlation(a,b,w,h,bestShift,Math.round(h*.23),Math.round(h*.115));
  if (verify < .88) return null;
  const confidenceEnd=prevContentEnd-bestShift;
  // Preserve ~2 rows of text on BOTH screenshots to avoid clipping letters.
  const skipUntil=Math.max(Math.round(h*.133),confidenceEnd-Math.round(h*.026));
  const ratio=skipUntil/h;
  if (ratio < .20 || ratio > .80) return null;
  return {
    similarity:Math.round(best*1000)/1000,
    verify:Math.round(verify*1000)/1000,
    shift:bestShift,
    skipUntilRatio:ratio
  };
}
