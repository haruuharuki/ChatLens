/** Conservative terminal bitmap isolation. Never mask an isolated glyph just
 * because it is colorful or short; require a separated filled square. */
const valid=b=>b&&['x0','x1','y0','y1'].every(k=>Number.isInteger(b[k]))&&b.x1>b.x0&&b.y1>b.y0;
export function trailingBitmap(box,p,w,h,column){
 if(!valid(box)||!column||!p||p.length!==w*h*4||box.x0<0||box.y0<0||box.x1>w||box.y1>h)return null;
 const H=box.y1-box.y0;if(H<15||H>90)return null;
 const ink=(x,y)=>{const i=(y*w+x)*4;return Math.max(p[i],p[i+1],p[i+2])>=90;};
 const start=Math.max(box.x0,Math.floor(column.x-5));let runs=[],r=null;
 for(let x=start;x<box.x1;x++){
  let n=0;for(let y=box.y0;y<box.y1;y++)if(ink(x,y))n++;
  if(n){if(!r)r={x0:x,x1:x+1};else r.x1=x+1;}else if(r){runs.push(r);r=null;}
 }if(r)runs.push(r);
 if(runs.length<2)return null;
 const last=runs.at(-1),prev=runs.at(-2),W=last.x1-last.x0;
 if(last.x0-prev.x1<Math.max(4,H*.12)||W<H*.65||W>H*1.25||last.x0<column.x+H*.8)return null;
 let y0=box.y1,y1=box.y0,total=0;
 for(let y=box.y0;y<box.y1;y++)for(let x=last.x0;x<last.x1;x++)if(ink(x,y)){total++;y0=Math.min(y0,y);y1=Math.max(y1,y+1);}
 const V=y1-y0;if(V<H*.65||W/V<.8||W/V>1.25||total/(W*V)<.77)return null;
 // Filled outer edges, unlike text strokes, provide actual image evidence.
 const edge=(horizontal,n)=>{let hits=0,N=horizontal?W:V;for(let k=0;k<N;k++)if(ink(horizontal?last.x0+k:n,horizontal?n:y0+k))hits++;return hits/N;};
 if([edge(true,y0),edge(true,y1-1),edge(false,last.x0),edge(false,last.x1-1)].filter(v=>v>=.75).length<3)return null;
 return {x0:last.x0,x1:last.x1,y0,y1,cutX:Math.floor((prev.x1+last.x0)/2)};
}
