/** D.2c: conservative per-image text-column evidence. Coordinates belong to
 * the cropped canvas, not the original screenshot. No fixed avatar width. */
export function inferTextColumn(lines,width){
 if(!Array.isArray(lines)||!Number.isFinite(width)||width<240)return null;
 const rows=lines.filter(r=>r?.kind==='body'&&!r.splitBody&&r.bbox&&
  [r.bbox.x0,r.bbox.x1,r.bbox.y0,r.bbox.y1].every(Number.isFinite)&&
  r.bbox.x0>=Math.max(8,width*.005)&&r.bbox.x0<width*.30&&
  r.bbox.x1-r.bbox.x0>=Math.max(80,width*.07)&&r.bbox.y1-r.bbox.y0>=12&&r.bbox.y1-r.bbox.y0<=width*.06)
  .sort((a,b)=>a.bbox.y0-b.bbox.y0);
 // Count independent vertical rows, not multiple detections of one line.
 const unique=[];for(const r of rows){const prev=unique.at(-1);if(!prev||r.bbox.y0>=prev.bbox.y1)unique.push(r);}
 if(unique.length<4)return null;
 const xs=unique.map(r=>r.bbox.x0).sort((a,b)=>a-b),tol=Math.max(2,Math.round(width*.003));
 let best=[];for(const x of xs){const g=xs.filter(v=>Math.abs(v-x)<=tol);if(g.length>best.length)best=g;}
 if(best.length<4||best.length<Math.ceil(xs.length*.75))return null;
 return {x:Math.round(best[Math.floor(best.length/2)]),samples:best.length};
}
/** Only trim an early-start body crop when it contains a colored left decoration,
 * an actual dark gutter at the proposed boundary, and text beyond that gutter.
 * Leave a generous margin; never trim already aligned, ambiguous, or non-body ROIs. */
export function safeTextLeft(pixels,width,height,box,column){
 if(!pixels||pixels.length!==width*height*4||!box||!column||!Number.isFinite(column.x))return null;
 const {x0,y0,x1,y1}=box;if(![x0,y0,x1,y1].every(Number.isFinite))return null;
 const pad=Math.max(8,Math.round((y1-y0)*.22)),cut=Math.floor(column.x-pad);
 if(cut<Math.max(0,x0)+16||x0>column.x*.30||x1<=column.x+16||cut<2||cut+2>=width)return null;
 const top=Math.max(0,Math.floor(y0)-4),bottom=Math.min(height,Math.ceil(y1)+4);
 if(bottom<=top)return null;
 let color=0,ink=0;
 for(let y=top;y<bottom;y++){
  for(let x=cut-2;x<=cut+2;x++){const i=(y*width+x)*4;if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>85)return null;}
  for(let x=Math.max(0,Math.floor(x0));x<cut-2;x++){const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(Math.max(r,g,b)>125&&Math.max(r,g,b)-Math.min(r,g,b)>55)color++;}
  for(let x=Math.max(cut+3,Math.floor(column.x));x<Math.min(width,x1,Math.ceil(column.x+80));x++){const i=(y*width+x)*4;if(Math.min(pixels[i],pixels[i+1],pixels[i+2])>143)ink++;}
 }
 return color>=12&&ink>=12?cut:null;
}
/** Body and already isolated mixed bands must retain vertical padding and marks. */
export function allowVerticalBand(kind,mixedBand){return kind==='mixed'&&!mixedBand;}
