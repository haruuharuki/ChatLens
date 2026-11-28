/** D.5d: conservative, reviewable pixel ownership; never rewrite OCR text. */
const valid=b=>b&&b.x1>b.x0&&b.y1>b.y0;
const median=a=>a.length?a.sort((x,y)=>x-y)[Math.floor(a.length/2)]:0;
const rgb=(p,w,x,y)=>{let i=(y*w+x)*4;return [p[i],p[i+1],p[i+2]];};
const max=c=>Math.max(...c),min=c=>Math.min(...c);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const intersects=(a,b)=>Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0)&&Math.min(a.y1,b.y1)>Math.max(a.y0,b.y0);
function pixels(b,w,h,fn){for(let y=clamp(Math.floor(b.y0),0,h);y<clamp(Math.ceil(b.y1),0,h);y++)for(let x=clamp(Math.floor(b.x0),0,w);x<clamp(Math.ceil(b.x1),0,w);x++)fn(x,y);}
const bright=c=>min(c)>=175&&max(c)-min(c)<35;
const glyph=c=>max(c)>=105;
export function typicalTextHeight(rows,w,h){return median(rows.filter(r=>['body','fragment'].includes(r.kind)&&!r.splitBody&&!r.mention&&valid(r.bbox)&&r.bbox.y0>4&&r.bbox.y1<h-4&&r.bbox.x1-r.bbox.x0>r.bbox.y1-r.bbox.y0&&r.bbox.y1-r.bbox.y0>=12&&r.bbox.y1-r.bbox.y0<=Math.min(h*.06,w*.09)).map(r=>r.bbox.y1-r.bbox.y0));}
/** Find compact raised neutral control surfaces, independent of OCR boxes.
 * A reaction may be selected/tinted; its neutral add-reaction neighbor is evidence. */
export function findControlBoxes(p,w,h,column,T){
 if(!column||T<12||!p||p.length!==w*h*4)return [];
 const step=2,W=Math.ceil(w/step),H=Math.ceil(h/step),mask=new Uint8Array(W*H),seen=new Uint8Array(W*H),out=[];
 const X=column.x;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const px=x*step,py=y*step;if(!(px>=X-T*.25&&px<X+T*8)&&!(px>w*.83&&py>h*.60))continue;
  const c=rgb(p,w,px,py),hi=max(c),lo=min(c);if(lo>=33&&hi<=95&&hi-lo<=15)mask[y*W+x]=1;
 }
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const stack=[i];seen[i]=1;let x0=W,y0=H,x1=0,y1=0,n=0;
  for(let j=0;j<stack.length;j++){let k=stack[j],x=k%W,y=Math.floor(k/W);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);n++;
   for(const v of [x>0?k-1:-1,x+1<W?k+1:-1,y>0?k-W:-1,y+1<H?k+W:-1])if(v>=0&&mask[v]&&!seen[v]){seen[v]=1;stack.push(v);}}
  const b={x0:x0*step,y0:y0*step,x1:Math.min(w,(x1+1)*step),y1:Math.min(h,(y1+1)*step)},bw=b.x1-b.x0,bh=b.y1-b.y0;
  if(bh<T*.65||bh>T*2.6||bw<T*.65||bw>T*5||n/((x1-x0+1)*(y1-y0+1))<.35)continue;
  const arrow=b.x0>w*.83&&b.y0>h*.60&&bw/bh>.65&&bw/bh<1.45;
  const reaction=b.x0>=X-T*.25&&b.x0<X+T*6&&bw/bh>=.65&&bw/bh<=2.5;
  if(!arrow&&!reaction)continue;
  let light=0,white=0;pixels(b,w,h,(x,y)=>{const c=rgb(p,w,x,y);if(max(c)>=120)light++;if(bright(c))white++;});
  if(light<bw*bh*(arrow?.012:.035)||white>bw*bh*.35)continue;
  out.push({...b,type:arrow?'arrow':'chip'});
 }
 // A standalone neutral rectangle can be inline code. Require adjacent chips
 // or an actual compact arrow on the right. Include a tinted preceding chip.
 const result=[];
 for(const b of out){if(b.type==='arrow'){result.push(b);continue;}
  const pair=out.find(a=>a!==b&&a.type==='chip'&&Math.abs(a.y0-b.y0)<T*.35&&Math.abs(a.y1-b.y1)<T*.35&&Math.max(a.x0-b.x1,b.x0-a.x1)<T*.6);
  if(pair){result.push(b);continue;}
  if(b.x0>X+T*1.35&&b.x0<X+T*4.5&&b.x1-b.x0<1.6*(b.y1-b.y0)){
   const left={x0:Math.max(0,Math.floor(X)),x1:b.x0,y0:b.y0,y1:b.y1};let tint=0;
   pixels(left,w,h,(x,y)=>{const c=rgb(p,w,x,y);if(min(c)>=30&&max(c)<=115&&max(c)-min(c)>=15)tint++;});
   if(tint>(left.x1-left.x0)*(left.y1-left.y0)*.16){result.push(b,{...left,type:'chip'});}
  }
 }
 return result;
}
export function controlOwned(b,controls,p,w,h,column,T){
 const hits=controls.filter(c=>intersects(b,c));if(!hits.length)return false;
 let inside=0,out=0,tail=0,tailColor=0,tailX0=w,tailY0=h,tailX1=0,tailY1=0;pixels({...b,x0:Math.max(b.x0,column.x-T*.15)},w,h,(x,y)=>{
  const c=rgb(p,w,x,y);if(!glyph(c))return;
  if(hits.some(a=>x>=a.x0-3&&x<a.x1+3&&y>=a.y0-3&&y<a.y1+3))inside++;
  else if(b.y1>=h-2&&y>h-T*1.35&&x<column.x+T*3&&hits.some(a=>a.type==='chip'&&y>=a.y1)){tail++;if(max(c)-min(c)>35)tailColor++;tailX0=Math.min(tailX0,x);tailX1=Math.max(tailX1,x);tailY0=Math.min(tailY0,y);tailY1=Math.max(tailY1,y);}
  else out++;
 });
 if(tail&&!(tailY1>=h-3&&tailColor/tail>.2&&tail/((tailX1-tailX0+1)*(tailY1-tailY0+1))>.48))out+=tail;
 return inside>=12&&out<=Math.max(8,inside*.045);
}
/** Edge clipping requires both contact with the actual boundary and short ink
 * height (or a visibly dim occluded bottom fragment). Keep complete short words. */
export function clippedEdge(b,p,w,h,column,T){
 if(!valid(b)||T<12||!column)return false;
 const top=b.y0<=2,bottom=b.y1>=h-2;if(!top&&!bottom)return false;
 const start=Math.max(Math.floor(column.x-T*.12),Math.floor(b.x0));
 let first=h,last=-1,edge=0,count=0,white=0,colors=0;
 pixels({...b,x0:start},w,h,(x,y)=>{const c=rgb(p,w,x,y);if(!glyph(c))return;first=Math.min(first,y);last=Math.max(last,y);count++;if(bright(c))white++;if(max(c)-min(c)>35)colors++;if(top?y<=2:y>=h-3)edge++;});
 if(!count)return b.y1-b.y0<T*.56;
 const H=b.y1-b.y0,inkH=last-first+1;
 if(edge>=Math.max(3,count*.035)&&H<T*.65&&inkH<T*.67)return true;
 // A dim strip of the following row under the composer is not a visible line.
 if(bottom&&H<T*.85&&white/count<.045&&colors/count<.50&&last>=h-4)return true;
 return false;
}
/** Small neutral suffix separated from the main white text, with aligned
 * baseline. Do not crop same-size gray text or a colored tag. */
export function visualEditedEdge(b,p,w,h,column){
 if(!valid(b)||!column)return null;const H=b.y1-b.y0;if(H<20)return null;
 const start=Math.max(0,Math.floor(column.x)),end=Math.min(w,Math.ceil(b.x1));
 let last=-1,top=h,bottom=-1;const muted=[];
 pixels({...b,x0:start,x1:end},w,h,(x,y)=>{let c=rgb(p,w,x,y);if(bright(c)){last=Math.max(last,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}});
 if(last<start||bottom-top<H*.35)return null;
 pixels({...b,x0:last+2,x1:end},w,h,(x,y)=>{let c=rgb(p,w,x,y);if(min(c)>=90&&max(c)<175&&max(c)-min(c)<25)muted.push([x,y]);});
 if(muted.length<12)return null;
 let l=end,r=0,t=h,d=0;for(const [x,y] of muted){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);d=Math.max(d,y);}
 const mh=d-t+1,mw=r-l+1,mainH=bottom-top+1;
 if(l-last<Math.max(3,H*.10)||l-last>H*.8||mw<H*.65||mw>H*3.6||mh<mainH*.30||mh>mainH*.75||d<bottom-mainH*.25||d>bottom+H*.18)return null;
 // Parenthesis-like edge strokes must span most of the muted suffix height.
 const edgeSpan=x=>{const ys=muted.filter(v=>Math.abs(v[0]-x)<=Math.max(2,H*.10)).map(v=>v[1]);return ys.length?Math.max(...ys)-Math.min(...ys)+1:0;};
 if(edgeSpan(l)<mh*.70||edgeSpan(r)<mh*.70)return null;
 return Math.min(end,last+3);
}
export function refineEdgeRows(rows,p,w,h,column,{cropped=false}={}){
 if(!p||!column)return rows;const T=typicalTextHeight(rows,w,h);if(T<12)return rows;
 const controls=findControlBoxes(p,w,h,column,T);
 return rows.map(r=>{if(!valid(r.bbox)||['covered','graphic','date'].includes(r.kind)||r.mention)return r;
  const b=r.bbox;
  const name=r.nameROI;
  if(cropped&&r.kind==='header'&&name&&name.y0<=2){
   let ink=0,cut=0;pixels(name,w,h,(x,y)=>{const c=rgb(p,w,x,y);if(max(c)>=105&&max(c)-min(c)>35){ink++;if(y<=2)cut++;}});
   if(ink>=30&&cut>=Math.max(6,ink*.035))return {...r,clippedName:true,reason:'ชื่อถูกตัดขอบบน — เก็บเฉพาะเวลาและเนื้อหาที่เห็น'};
  }
  if(clippedEdge(b,p,w,h,column,T))return {...r,kind:'covered',alternateBody:false,edgeClipped:true,reason:'ขอบภาพตัดตัวอักษร ไม่ส่งเข้าบทสนทนา'};
  if(['body','fragment','reply'].includes(r.kind)&&controlOwned(b,controls,p,w,h,column,T))return {...r,kind:'graphic',alternateBody:false,reason:'พิกเซลอยู่ในปุ่ม Reaction/ลูกศร'};
  return r;
 });
}
