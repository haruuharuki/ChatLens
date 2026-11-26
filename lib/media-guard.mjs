/**
 * Guard against hallucinated OCR text from a HIGH-CONFIDENCE white photo/card at
 * the bottom of a DARK Discord screenshot. A conservative partial detector:
 * screenshots without such a card are left unchanged. This does not parse the
 * attached picture, and never edits the original user image.
 */
export function detectBottomPhoto(imageData, width, height) {
  const pixels = imageData?.data || imageData;
  if (!pixels || width < 200 || height < 400 || pixels.length < width*height*4) return null;
  const x0=Math.floor(width*.03), x1=Math.floor(width*.78);
  const stepX=5, stepY=6;
  const count = Math.ceil((x1-x0)/stepX);
  function ratios(y){
    let bright=0,notBackground=0;
    for(let x=x0;x<x1;x+=stepX){
      const i=(y*width+x)*4;
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      if(.299*r+.587*g+.114*b>210)bright++;
      if(Math.max(Math.abs(r-26),Math.abs(g-26),Math.abs(b-30))>50)notBackground++;
    }
    return [bright/count,notBackground/count];
  }
  let first=-1,run=0;
  for(let y=Math.floor(height*.20);y<height-12;y+=stepY){
    const [bright]=ratios(y);
    if(bright>.56){if(run===0)first=y;run++;if(run*stepY>=90)break;}
    else {first=-1;run=0;}
  }
  if(run*stepY<90||first<0)return null;
  // Only mask if card clearly persists to the screenshot bottom.
  const tail=[.84,.90,.96].map(f=>ratios(Math.min(height-1,Math.floor(height*f)))[1]);
  if(tail.filter(v=>v>.56).length<2)return null;
  const start=Math.max(0,first-8);
  return {x:0,y:start,width,height:height-start,kind:'bottom-photo'};
}

export function maskBottomPhoto(canvas) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  const photo=detectBottomPhoto(ctx.getImageData(0,0,canvas.width,canvas.height),canvas.width,canvas.height);
  if(photo){
    ctx.fillStyle='#1a1a20';
    ctx.fillRect(photo.x,photo.y,photo.width,photo.height);
  }
  return photo;
}
