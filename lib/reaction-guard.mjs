/**
 * Conservative visual Discord reaction-pill detector for dark screenshots.
 * Only remove a horizontal ROW of two or more adjacent rounded UI chips
 * with the characteristic Discord neutral/selected background, never an
 * isolated emoji or an arbitrary OCR line. Unknown layouts stay untouched.
 * Works on an in-memory image canvas; screenshots are never uploaded.
 */

const TARGET_WIDTH = 600;
const nearColor = (r,g,b,rr,gg,bb,range) =>
  Math.abs(r-rr)<=range && Math.abs(g-gg)<=range && Math.abs(b-bb)<=range;

function isPillFill(r,g,b) {
  // Discord dark mode: ordinary reaction/background-add chip and selected chip.
  return nearColor(r,g,b,42,41,47,9) || nearColor(r,g,b,41,44,77,11);
}

/** Return screenshot-coordinate rectangles for high-confidence reaction rows.
 * rgba is 4-channel pixel data, typically a <= 600px-wide thumbnail.
 * No OCR text is used here; if the shape is not convincing, do not crop it.
 */
export function findReactionRows(rgba,width,height) {
  if (!rgba || !Number.isInteger(width) || !Number.isInteger(height) ||
      width<180 || height<100 || rgba.length<width*height*4) return [];
  const n=width*height;
  const binary=new Uint8Array(n),visited=new Uint8Array(n);
  for(let p=0,j=0;p<n;p++,j+=4) {
    if(isPillFill(rgba[j],rgba[j+1],rgba[j+2])) binary[p]=1;
  }
  const queue=new Int32Array(n);
  const candidates=[];
  const minW=Math.round(width*.038), maxW=Math.round(width*.26);
  const minH=Math.round(width*.028), maxH=Math.round(width*.14);
  for(let p=0;p<n;p++) {
    if(!binary[p]||visited[p])continue;
    visited[p]=1;queue[0]=p;
    let first=0,last=1,minX=width,minY=height,maxX=-1,maxY=-1;
    while(first<last) {
      const q=queue[first++],x=q%width,y=(q-x)/width;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(x>0){const np=q-1;if(binary[np]&&!visited[np]){visited[np]=1;queue[last++]=np;}}
      if(x<width-1){const np=q+1;if(binary[np]&&!visited[np]){visited[np]=1;queue[last++]=np;}}
      if(y>0){const np=q-width;if(binary[np]&&!visited[np]){visited[np]=1;queue[last++]=np;}}
      if(y<height-1){const np=q+width;if(binary[np]&&!visited[np]){visited[np]=1;queue[last++]=np;}}
    }
    const w=maxX-minX+1,h=maxY-minY+1;
    if(w>=minW && w<=maxW && h>=minH && h<=maxH &&
       last/(w*h)>=.22 && minX>=width*.09 && minX<=width*.80) {
      candidates.push({x:minX,y:minY,width:w,height:h,fill:last/(w*h)});
    }
  }
  // A reaction chip is almost always beside another reaction or the "+" chip.
  // An isolated highlighted mention, role badge or text glyph must never qualify.
  const used=new Set(),groups=[];
  for(let i=0;i<candidates.length;i++) {
    const a=candidates[i];
    for(let j=i+1;j<candidates.length;j++) {
      const b=candidates[j];
      const left=a.x<=b.x?a:b,right=a.x<=b.x?b:a;
      const gap=right.x-(left.x+left.width);
      const overlap=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
      if(gap>=-width*.008 && gap<=width*.035 &&
         overlap>=.66*Math.min(a.height,b.height) &&
         Math.abs(a.height-b.height)<=width*.032) {
        used.add(i);used.add(j);
      }
    }
  }
  // Transitive grouping by similar row y, so 3+ reaction chips are one mask.
  const eligible=[...used].map(i=>candidates[i]).sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const c of eligible) {
    const previous=groups.find(g=>Math.min(g.y+g.height,c.y+c.height)-Math.max(g.y,c.y)>.65*Math.min(g.height,c.height));
    if(previous) {
      const right=Math.max(previous.x+previous.width,c.x+c.width);
      const bottom=Math.max(previous.y+previous.height,c.y+c.height);
      previous.x=Math.min(previous.x,c.x);previous.y=Math.min(previous.y,c.y);
      previous.width=right-previous.x;previous.height=bottom-previous.y;
      previous.count++;
    } else groups.push({...c,count:1});
  }
  return groups.filter(g=>g.count>=2).map(({x,y,width:w,height:h,count})=>({x,y,width:w,height:h,count}));
}

/** Remove only confident reaction pills from the disposable OCR canvas. */
export function maskReactionRows(canvas) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const factor=Math.min(1,TARGET_WIDTH/canvas.width);
  const w=Math.max(1,Math.round(canvas.width*factor)),h=Math.max(1,Math.round(canvas.height*factor));
  const sample=document.createElement('canvas');sample.width=w;sample.height=h;
  const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
  sampleCtx.drawImage(canvas,0,0,w,h);
  const pixels=sampleCtx.getImageData(0,0,w,h).data;
  const rectangles=findReactionRows(pixels,w,h);
  for(const rect of rectangles){
    const padX=Math.max(3,Math.round(canvas.width*.006));
    const padY=Math.max(3,Math.round(canvas.width*.006));
    const x=Math.max(0,Math.floor(rect.x/factor)-padX),y=Math.max(0,Math.floor(rect.y/factor)-padY);
    const x2=Math.min(canvas.width,Math.ceil((rect.x+rect.width)/factor)+padX);
    const y2=Math.min(canvas.height,Math.ceil((rect.y+rect.height)/factor)+padY);
    // Use the exact screenshot background from the far right of this row.
    const pixel=ctx.getImageData(canvas.width-1,Math.min(canvas.height-1,Math.max(0,y)),1,1).data;
    ctx.fillStyle=`rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
    ctx.fillRect(x,y,x2-x,y2-y);
  }
  return rectangles.length;
}
