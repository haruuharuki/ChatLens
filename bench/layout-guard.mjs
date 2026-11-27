/**
 * Phase C.2: experimental Discord screenshot layout aids.
 * NEVER classify an omitted message as deleted, and NEVER edit the source image.
 * Heuristics are opt-out and their output is previewed before users trust OCR.
 */
const finite=x=>Number.isFinite(x);
const bounded=(x,min,max)=>Math.max(min,Math.min(max,x));

/** Estimate the common x-position of message bodies from multiple Tesseract lines.
 * Deliberately require multiple observations; one avatar-contaminated box must
 * not set a misleading global body margin. */
export function inferBodyTextAnchor(lines,canvasWidth){
 if(!Array.isArray(lines)||!finite(canvasWidth)||canvasWidth<120)return null;
 const xs=lines.filter(l=>l?.kind==='body'&&l?.bbox&&
  finite(l.bbox.x0)&&finite(l.bbox.x1)&&finite(l.bbox.y0)&&finite(l.bbox.y1)&&
  l.bbox.x1-l.bbox.x0>=Math.max(80,canvasWidth*.16)&&
  l.bbox.y1-l.bbox.y0>=9&&l.bbox.y1-l.bbox.y0<=canvasWidth*.16)
  .map(l=>l.bbox.x0).filter(x=>x>=0&&x<canvasWidth*.6).sort((a,b)=>a-b);
 if(xs.length<4)return null;
 // Slightly upper median avoids avatar-induced x0 outliers (near zero).
 const anchor=xs[Math.floor(xs.length*.6)];
 const nearby=xs.filter(x=>Math.abs(x-anchor)<=canvasWidth*.065);
 if(nearby.length<Math.ceil(xs.length*.55))return null;
 return Math.round(anchor);
}

function whitePixel(r,g,b){return Math.min(r,g,b)>=207&&Math.max(r,g,b)-Math.min(r,g,b)<33;}
function saturated(r,g,b){return Math.max(r,g,b)>125&&Math.max(r,g,b)-Math.min(r,g,b)>62;}
/** Identify a large decorated square at the far RIGHT of a line crop.
 * Plain white glyphs rarely fill >55% of a character-height-wide rectangle.
 * A white-backed sticker/emoji does; bright-colored emoji also have dense color.
 * Only trims if there is a clear large block near the end, never mid-sentence.
 */
export function trailingDecorationCut(pixels,width,height){
 if(!(pixels instanceof Uint8ClampedArray)||pixels.length!==width*height*4||width<84||height<19)return null;
 const win=Math.round(bounded(height*.77,17,Math.min(88,width*.22)));
 const yFrom=Math.max(1,Math.round(height*.12)),yTo=Math.min(height-1,Math.round(height*.88));
 const nRows=yTo-yFrom;
 if(nRows<12)return null;
 const start=Math.max(Math.round(width*.52),width-Math.max(Math.round(height*2.6),Math.round(width*.43)));
 const end=Math.min(width-win,Math.round(width*.94));
 let best=null;
 // Sampling every 2 pixels in both axes limits work on iPhone.
 for(let x=start;x<=end;x+=2){
  let total=0,white=0,color=0;
  for(let yy=yFrom;yy<yTo;yy+=2)for(let xx=x;xx<x+win;xx+=2){
   const i=(yy*width+xx)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
   total++;if(whitePixel(r,g,b))white++;if(saturated(r,g,b))color++;
  }
  const whiteness=white/total,colors=color/total;
  // If this window contains a clear rectangular artwork, trim at its LEFT edge.
  // Avoid a catastrophic whole-line trim by limiting to last ~43% of a line.
  const type=whiteness>.59?'light-image':colors>.42?'colored-image':null;
  if(!type)continue;
  if(width-(x+win)>Math.max(8,height*.55))continue;
  best={x,type,fill:Math.max(whiteness,colors)};
  break;
 }
 return best;
}

/** mask only; no resizing and never writes into original pixels. */
export function isolateBodyLayoutRGBA(source,width,height,{absoluteX=0,anchorX=null}={}){
 if(!(source instanceof Uint8ClampedArray)||source.length!==width*height*4||width<=0||height<=0)throw new Error('Invalid ROI pixels');
 const result=new Uint8ClampedArray(source);
 const anchorOffset=anchorX===null?0:Math.round(anchorX-absoluteX);
 const leftCut=anchorOffset>=Math.max(30,height*.8)&&anchorOffset<width*.42?bounded(anchorOffset-5,0,width):0;
 const trailing=trailingDecorationCut(source,width,height);
 const rightCut=trailing?.x??width;
 for(let y=0;y<height;y++){
  const row=y*width*4;
  for(let x=0;x<leftCut;x++){const i=row+x*4;result[i]=result[i+1]=result[i+2]=26;}
  for(let x=rightCut;x<width;x++){const i=row+x*4;result[i]=result[i+1]=result[i+2]=26;}
 }
 return {pixels:result,leftCut,rightCut,width,height,decoration:trailing?.type??null};
}

/** Never claim CER on annotations that describe artwork absent from OCR input. */
export function referenceHasArtworkNotes(text){
 return /[（(][^（）()]{0,45}(?:อิโมจิ|อีโมจิ|emoji|โปรไฟล์|avatar|รูปภาพ|ภาพประกอบ|สติกเกอร์|sticker)[^（）()]{0,45}[)）]/iu.test(String(text??''));
}
