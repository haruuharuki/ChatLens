import test from 'node:test';
import assert from 'node:assert/strict';
import {clippedWhiteTop,refineEdgeRows} from '../d5d-layout.mjs';
import {contrastRGBA,variantPriority,selectVariantReading} from '../recognition-variants.mjs';
import {assembleTextTranscript,formatTextTranscript} from '../text-transcript.mjs';
import {nameKey,viewportEvidence,mergeQueueRecords} from '../queue-merge.mjs';
const W=300,H=400,C={x:45,samples:8},T=30;
const blank=()=>new Uint8Array(W*H*4).fill(26);
const rect=(p,x,y,w,h,color=[225,225,225])=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)p.set(color,(j*W+i)*4);};
const box=(y,x=45,x1=200,height=30)=>({x0:x,y0:y,x1,y1:y+height});
const row=(kind,text,y,extra={})=>({kind,text,bbox:box(y),...extra});
test('wide OCR box that includes avatar is clipped only when distributed text ink touches the actual top boundary',()=>{
 const p=blank(),b=box(0,0,200,39);rect(p,0,0,25,39,[220,110,40]);for(let i=0;i<6;i++)rect(p,45+i*22,0,8,20);
 assert.equal(clippedWhiteTop(b,p,W,H,C,T),true);
 const rows=[{kind:'body',bbox:b},...Array.from({length:5},(_,i)=>row('body','sample',80+i*50,{bbox:box(80+i*50,45,200,24)}))];
 assert.equal(refineEdgeRows(rows,p,W,H,C,{cropped:true})[0].kind,'covered');
 assert.notEqual(refineEdgeRows(rows,p,W,H,C,{cropped:false})[0].kind,'covered');
 const q=blank();rect(q,0,0,25,39,[220,110,40]);for(let i=0;i<6;i++)rect(q,45+i*22,7,8,20);
 assert.equal(clippedWhiteTop(b,q,W,H,C,T),false);
 assert.equal(clippedWhiteTop(b,p,W,H,{x:45,samples:2},T),false);
});
test('a colored top header strip is not mistaken for a clipped white body',()=>{
 const p=blank();for(let i=0;i<6;i++){rect(p,45+i*22,0,8,5,[30,180,90]);rect(p,45+i*22,10,8,20);}
 assert.equal(clippedWhiteTop(box(0,0,200,39),p,W,H,C,T),false);
});
test('contrast retains image dimensions, source bytes, monotonic intensity and no binary erosion',()=>{
 const p=new Uint8ClampedArray([25,25,25,255,90,90,90,255,130,130,130,255,220,220,220,255]);const old=p.slice(),q=contrastRGBA(p,4,1);
 assert.deepEqual(p,old);assert.equal(q.length,p.length);assert.ok(q[0]<q[4]&&q[4]<q[8]&&q[8]<q[12]);
 assert.throws(()=>contrastRGBA(p,2,1));
});
test('only suitable Thai body/reply candidates enter a bounded variant experiment; same-engine agreement is eligible',()=>{
 assert.ok(variantPriority({kind:'body'},'อยู่ทีบ้าน','อยู่ทีบ้าน',220,40)>=0);
 assert.equal(variantPriority({kind:'body',mention:true},'อยู่ทีบ้าน','อยู่ทีบ้าน',220,40),-1);
 assert.equal(variantPriority({kind:'body',omitEdge:true},'อยู่ทีบ้าน','อยู่ทีบ้าน',220,40),-1);
 assert.equal(variantPriority({kind:'header'},'อยู่ทีบ้าน','อยู่ทีบ้าน',220,40),-1);
});
test('two contrast readings can restore an observed mark but cannot invent a different base or override a competing tone',()=>{
 const f=(c,v,o=c)=>selectVariantReading(c,o,c,c,{open:v,tess:v});
 assert.equal(f('อยู่ทีบ้าน','อยู่ที่บ้าน'),'อยู่ที่บ้าน');
 assert.equal(f('อยู่ทีบ้าน','อยู่ที้บ้าน','อยู่ที่บ้าน'),'อยู่ทีบ้าน');
 assert.equal(f('อยู่ทีบ้าน','อยู่ที่งาน'),'อยู่ทีบ้าน');
 assert.equal(selectVariantReading('อยู่ทีบ้าน','อยู่ทีบ้าน','อยู่ทีบ้าน','อยู่ทีบ้าน',{open:'อยู่ที่บ้าน',tess:'อยู่ทีบ้าน'}),'อยู่ทีบ้าน');
});
test('corroborated terminal punctuation and inline bullet survive, unsupported substitutions do not',()=>{
 assert.equal(selectVariantReading('ไปนะ','ไปนะ-','ไปนะ','ไปนะ',{open:'ไปนะ-',tess:'ไปนะ-'}),'ไปนะ-');
 assert.equal(selectVariantReading('ไปนะ','ไปนะ','ไปนะ','ไปนะ',{open:'ไปนะ-',tess:'ไปนะ'}),'ไปนะ');
 assert.equal(selectVariantReading('แรก » สอง','แรก » สอง','แรก » สอง','แรก » สอง',{open:'แรก • สอง',tess:'แรก • สอง'}),'แรก • สอง');
});
test('visible transcript omits occluded rows but retains the evidence for matching; complete short lines survive',()=>{
 const out=assembleTextTranscript([row('header','Alpha 11/27/26, 1:00 PM',50),row('body','ข้อความครบ',90),row('body','partial text',120,{omitEdge:true,edgePartial:true}),row('fragment','OK',160,{baseline:'OK',candidate:'OK'})]);
 assert.match(formatTextTranscript(out),/ข้อความครบ\nOK/);assert.doesNotMatch(formatTextTranscript(out),/partial text/);assert.ok(out.entries.at(-1).sourceLines.some(l=>l.omitEdge));
});
test('canonical name evidence tolerates a wider crop containing neutral clock, not different visible glyphs',()=>{
 const p=blank();rect(p,45,50,8,22,[30,180,90]);rect(p,60,50,8,22,[30,180,90]);rect(p,80,50,8,22,[30,180,90]);rect(p,120,52,60,18,[150,150,150]);
 const a=nameKey(p,W,H,box(45,40,100,35)),b=nameKey(p,W,H,box(45,40,285,35));assert.ok(a);assert.equal(a,b);
 rect(p,60,45,4,3,[30,180,90]);assert.notEqual(nameKey(p,W,H,box(45,40,285,35)),a);
});
// Independent geometry for overlap fixtures: no real screenshot or chat text.
const world=new Uint8Array(W*800*4).fill(26);let seed=97;
for(let y=0;y<800;y++)for(let x=45;x<220;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed%17<3)world.fill(230,(y*W+x)*4,(y*W+x)*4+3);}
const evidence=start=>viewportEvidence(world.slice(start*W*4,(start+H)*W*4),W,H,C);
const msg=(text,y,extra={})=>({speaker:'Alpha',time:'1:00 PM',date:'November 27, 2026',body:text,lines:[{text,box:box(y),...extra}],atTop:y<90,atBottom:y>300});
const done=(start,entries)=>({state:'done',records:{viewport:evidence(start),entries}});
test('occluded text is not shown alone; verified overlap with complete line restores it once',()=>{
 const a=done(0,[msg('complete message par',320,{omitEdge:true,edge:true})]),b=done(300,[msg('complete message part',20)]);
 assert.doesNotMatch(mergeQueueRecords([a]).text,/complete message/);
 const m=mergeQueueRecords([a,b]);assert.equal(m.overlaps,1);assert.equal(m.text.match(/complete message part/g).length,1);assert.doesNotMatch(m.text,/complete message par\n/);
 const n=mergeQueueRecords([a,done(410,[msg('unrelated message',20)])]);assert.equal(n.overlaps,0);assert.doesNotMatch(n.text,/complete message par/);
});
test('cross-image name marks require exact glyph key and corroboration, conflicting name marks remain uncertain',()=>{
 const a={...msg('first',90),speaker:'[Team] กี',uncertain:true,nameKey:'exact',nameObservations:[{name:'[Team] กี่',source:'native'}]};
 const b={...msg('second',90),speaker:'[Team] กี่',uncertain:true,nameKey:'exact',nameObservations:[{name:'[Team] กี่',source:'baseline'}]};
 const m=mergeQueueRecords([done(0,[a]),done(400,[b])]);assert.equal(m.nameLinks,1);assert.equal(m.text.match(/\[Team\] กี่/g).length,2);
 assert.equal(mergeQueueRecords([done(0,[a]),done(400,[{...b,nameKey:'other'}])]).nameLinks,0);
 assert.equal(mergeQueueRecords([done(0,[a]),done(400,[{...b,speaker:'[Team] กี้'}])]).nameLinks,0);
});
