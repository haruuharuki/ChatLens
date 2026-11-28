/** Only link a visible reply name to a header when its colored glyph silhouette
 * matches uniquely. Keep the original OCR for review and fail open on badges,
 * ambiguous shapes, or a quote with no separately visible text. */
const valid=b=>b&&['x0','x1','y0','y1'].every(k=>Number.isFinite(b[k]))&&b.x1>b.x0&&b.y1>b.y0;
const rgb=(p,w,x,y)=>{const i=(y*w+x)*4;return [p[i],p[i+1],p[i+2]];};
const hi=c=>Math.max(...c),lo=c=>Math.min(...c);
function visit(b,p,w,h,fn){for(let y=Math.max(0,Math.floor(b.y0));y<Math.min(h,Math.ceil(b.y1));y++)for(let x=Math.max(0,Math.floor(b.x0));x<Math.min(w,Math.ceil(b.x1));x++)fn(x,y,rgb(p,w,x,y));}
function dominant(b,p,w,h){const counts=new Map();visit(b,p,w,h,(_,__,c)=>{if(hi(c)>135&&hi(c)-lo(c)>55){const k=c.join(',');counts.set(k,(counts.get(k)||0)+1);}});const a=[...counts].sort((a,b)=>b[1]-a[1])[0];return a&&a[1]>=12?a[0].split(',').map(Number):null;}
function sameHue(c,ref){const delta=hi(ref)-lo(ref),d=hi(c)-lo(c);if(d<delta*.38||hi(c)<95)return false;return c.every((v,i)=>Math.abs((v-lo(c))/d-(ref[i]-lo(ref))/delta)<.12);}
function mask(b,p,w,h,color){const pts=[];visit(b,p,w,h,(x,y,c)=>{if(sameHue(c,color))pts.push([x,y]);});return pts;}
function shape(pts){if(pts.length<30)return null;let x0=Infinity,y0=Infinity,x1=0,y1=0;for(const [x,y] of pts){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}const W=x1-x0+1,H=y1-y0+1;if(H<9||W<12)return null;return {pts,x0,y0,x1:x1+1,y1:y1+1,W,H};}
function grid(s,W,H){const src=new Uint8Array(s.W*s.H),a=new Uint8Array(W*H);for(const [x,y] of s.pts)src[(y-s.y0)*s.W+x-s.x0]=1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[y*W+x]=src[Math.min(s.H-1,Math.floor((y+.5)*s.H/H))*s.W+Math.min(s.W-1,Math.floor((x+.5)*s.W/W))];return a;}
function score(a,b){if(!a||!b||Math.abs(a.W/a.H-b.W/b.H)>.10*Math.max(a.W/a.H,b.W/b.H))return 0;const H=24,W=Math.round(Math.min(420,(a.W/a.H+b.W/b.H)*H/2)),A=grid(a,W,H),B=grid(b,W,H);let best=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-2;dx<=2;dx++){let both=0,total=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=A[y*W+x],u=(x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H)?B[(y+dy)*W+x+dx]:0;both+=v&&u;total+=v||u;}best=Math.max(best,both/Math.max(1,total));}return best;}
function quoteShapes(r,p,w,h,column,color){const b=r.bbox,H=b.y1-b.y0,start=Math.max(b.x0,Math.floor(column.x+H*.78),r.textLeft??0);let pts=mask({...b,x0:start},p,w,h,color);if(!pts.length)return [];const cols=new Set(pts.map(v=>v[0]));const xs=[...cols].sort((a,b)=>a-b),runs=[];let a=xs[0],last=a;for(const x of xs.slice(1)){if(x-last>1){runs.push([a,last+1]);a=x;}last=x;}runs.push([a,last+1]);
 // @ is the first colored glyph, separated from the rest of the author name.
 if(runs.length<2||runs[0][1]-runs[0][0]<H*.18||runs[0][1]-runs[0][0]>H*.9)return [];
 const begin=runs[1][0],out=[];for(let i=1;i<runs.length;i++){const end=runs[i][1],gap=(runs[i+1]?.[0]??b.x1)-end;if(i<runs.length-1&&gap<H*.17)continue;const s=shape(pts.filter(v=>v[0]>=begin&&v[0]<end));if(s)out.push(s);}return out;}
function bodyLeft(r,s,p,w,h){const b=r.bbox,H=b.y1-b.y0;let start=s.x1+1;
 // A badge is a small raised neutral pill. Skip it only when a distinct
 // contiguous surface and following neutral quote text are visible.
 let badgeStart=-1,badgeEnd=-1,run=0;for(let x=start;x<Math.min(b.x1,start+H*3.2);x++){let n=0;for(let y=b.y0;y<b.y1;y++){const c=rgb(p,w,x,y);if(lo(c)>=33&&hi(c)<95&&hi(c)-lo(c)<16)n++;}
  if(n>=H*.32){if(badgeStart<0)badgeStart=x;badgeEnd=x;run=0;}else if(badgeStart>=0&&++run>H*.18)break;
 }
 if(badgeStart>=0&&badgeStart-start<H*.65&&badgeEnd-badgeStart>=H*.7&&badgeEnd-badgeStart<=H*3)start=badgeEnd+2;
 let first=Infinity,n=0;visit({...b,x0:start},p,w,h,(x,y,c)=>{if(hi(c)>=100&&hi(c)-lo(c)<28){first=Math.min(first,x);n++;}});
 if(n<12||first===Infinity||first-start<H*.08)return null;
 return Math.max(start,first-3);}
export function linkReplyRegions(rows,p,w,h,column){if(!column||!p||p.length!==w*h*4)return rows;
 const heads=rows.filter(r=>['header','mixed'].includes(r.kind)&&valid(r.nameROI)&&r.nameEvidence&&!r.clippedName).map(r=>{let color=dominant(r.nameROI,p,w,h);return color?{r,color,s:shape(mask(r.nameROI,p,w,h,color))}:null;}).filter(x=>x?.s);
 return rows.map(r=>{if(r.kind!=='reply'||r.replyContinuation||!valid(r.bbox))return r;const matches=[];
 for(const head of heads){for(const s of quoteShapes(r,p,w,h,column,head.color)){const sim=score(head.s,s);if(sim>=.68)matches.push({head,s,sim});}}
 matches.sort((a,b)=>b.sim-a.sim);const best=matches[0];if(!best)return r;
 // A repeat of the exact same name is not a competing author. Different
 // observed name evidence or different shape must not be conflated.
 const same=(a,b)=>score(a.head.s,b.head.s)>.96&&a.head.color.every((v,i)=>Math.abs(v-b.head.color[i])<=3);
 if(matches.some(m=>m!==best&&!same(best,m)&&m.sim>=best.sim-.07))return r;
 const left=bodyLeft(r,best.s,p,w,h);if(left===null)return r;
 return {...r,replyIdentity:{headerBox:best.head.r.nameROI,score:Number(best.sim.toFixed(3)),bodyLeft:left},textLeft:left};
 });
}
