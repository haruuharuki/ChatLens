/**
 * Safe-ish dark-theme color filter for separate OCR crops.
 * This is NOT semantic text recognition: colored photos can mimic text colors.
 * Always keep raw crop, make opt-in/opt-out, never use on the source screenshot.
 */
const nearWhite=(r,g,b)=>Math.min(r,g,b)>=143&&Math.max(r,g,b)-Math.min(r,g,b)<=48;
const mutedGray=(r,g,b)=>Math.min(r,g,b)>=103&&Math.max(r,g,b)-Math.min(r,g,b)<=19;
const nameGreen=(r,g,b)=>g>=125&&g>=r*1.17&&g>=b*1.08;
const nameBlue=(r,g,b)=>b>=130&&b>=r*1.12&&b>=g*1.06;
const namePurple=(r,g,b)=>r>=110&&b>=145&&b>=g*1.14&&Math.abs(b-r)<95;
export function maskNonTextColors(source,width,height,{enabled=true,blackoutLeft=0,background=[27,28,32]}={}){
 if(!source||source.length!==width*height*4||width<=0||height<=0)throw new Error('Invalid RGBA screenshot');
 const out=new Uint8ClampedArray(source);let kept=0,masked=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,r=source[i],g=source[i+1],b=source[i+2];
  const textColored=nearWhite(r,g,b)||mutedGray(r,g,b)||nameGreen(r,g,b)||nameBlue(r,g,b)||namePurple(r,g,b);
  const allow=(!enabled||(x>=blackoutLeft&&textColored));
  if(allow)kept++;
  else {out[i]=background[0];out[i+1]=background[1];out[i+2]=background[2];masked++;}
  out[i+3]=255;
 }
 return {pixels:out,kept,masked};
}
