import test from 'node:test';
import assert from 'node:assert/strict';
import {thaiMarkDominates,observedMarkReading,selectBilingualText} from '../region-output.mjs';
import {corroboratedName,resolveNameEvidence} from '../name-evidence.mjs';
import {assembleTextTranscript} from '../text-transcript.mjs';
import {edgeAvatarLeft,clippedEdge,refineEdgeRows} from '../d5d-layout.mjs';
import {viewportEvidence,findViewportOverlap,mergeQueueRecords} from '../queue-merge.mjs';
const box=(y,x=40,x1=180,H=24)=>({x0:x,y0:y,x1,y1:y+H});
const row=(kind,text,y,extra={})=>({kind,text,bbox:box(y),...extra});
test('tone can be restored above an existing vowel, not replace conflicting tones or vowels',()=>{
 assert.equal(thaiMarkDominates('ที่','ที'),true);assert.equal(thaiMarkDominates('ที่','ที้'),false);
 assert.equal(thaiMarkDominates('ขี่','ขี'),true);assert.equal(thaiMarkDominates('ขี่','ขิ'),false);
 assert.equal(observedMarkReading('มีที ว่าง','มีที่ว่าง','มีที ว่าง'),'มีที่ว่าง');
 assert.equal(observedMarkReading('มีทีว่าง','มีที่ว่าง','มีที้ว่าง'),'มีทีว่าง');
});
test('short fragment cannot be expanded by one uncorroborated vowel; actual double observation wins',()=>{
 assert.equal(selectBilingualText('กละ','กูละ','กละ',{shortFragment:true}),'กละ');
 assert.equal(selectBilingualText('ขาดาย','ขาตาย','ขาตาย',{shortFragment:true}),'ขาตาย');
});
test('punctuation present in two observations stays; different base glyphs are not invented',()=>{
 assert.equal(selectBilingualText('ไปนะ','ไปนะ-','ไปนะ-'),'ไปนะ-');
 assert.equal(selectBilingualText('ไปนู้น','ไปบ้าน','ไปบ้าน'),'ไปนู้น');
});
test('reply continuation may use a complete mark-only observation, not replace quote punctuation',()=>{
 const a=assembleTextTranscript([row('reply','@Alpha quote',10),row('reply','อยู่ทีบ้าน...',40,{replyContinuation:true,candidate:'อยู่ที่บ้าน...',baseline:'อยู่ทีบ้าน...'}),row('header','Beta 11/27/26, 1:00 PM',70),row('body','ตอบแล้ว',100)]);
 assert.equal(a.entries.at(-1).reply,'@Alpha quote\nอยู่ที่บ้าน...');
 const b=assembleTextTranscript([row('reply','@Alpha quote',10),row('reply','อยู่ทีบ้าน...',40,{replyContinuation:true,candidate:'อยู่ที่บ้าน',baseline:'อยู่ทีบ้าน...'}),row('header','Beta 11/27/26, 1:00 PM',70),row('body','ตอบแล้ว',100)]);
 assert.equal(b.entries.at(-1).reply,'@Alpha quote\nอยู่ทีบ้าน...');
});
test('name enhancement requires isolated OpenThai plus another actual reading; never changes letters or conflicting marks',()=>{
 const a='[Team] กี',b='[Team] กี่',c='[Team] กี้';
 const obs=[{name:a,source:'native'},{name:b,source:'open-name'},{name:b,source:'open-full'}];
 assert.equal(corroboratedName(a,obs),b);assert.equal(corroboratedName(a,obs.slice(0,2)),null);
 assert.equal(corroboratedName(a,[...obs,{name:c,source:'scaled'}]),null);
 assert.equal(corroboratedName('[Other] กี',obs),null);
});
test('complete name evidence can improve local header without using candidate time as timestamp',()=>{
 const raw='[Team] กี 11/27/26, 1:00 PM',r=row('header',raw,50,{layoutHeader:true,nameROI:box(50),nameEvidence:{full:raw,nearby:raw,native:'[Team] กี',scaled:'[Team] กี'},nameOpenThai:'[Team] กี่',candidate:'[Team] กี่ 11/27/26, 1:00 PM',baseline:raw});
 const out=resolveNameEvidence([r],null,300,400)[0];assert.equal(out.nameResolution.speaker,'[Team] กี่');assert.equal(out.nameResolution.time,'1:00 PM');assert.equal(out.nameResolution.uncertain,true);
 assert.equal(resolveNameEvidence([{...r,candidate:'[Team] กี่ 11/27/26, 1:01 PM'}],null,300,400)[0].nameResolution.speaker,'[Team] กี');
 assert.equal(resolveNameEvidence([{...r,clippedName:true}],null,300,400)[0].nameResolution,undefined);
});
const W=300,H=400,C={x:45,samples:8};
function blank(){return new Uint8Array(W*H*4).fill(26);}
function rect(p,x,y,w,h,color=[225,225,225]){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){const k=(j*W+i)*4;p.set(color,k);}}
test('edge-avatar crop requires actual dark gutter, stable column and white text below; preserves left glyphs on contact',()=>{
 const p=blank(),b={x0:0,x1:180,y0:0,y1:32};rect(p,2,5,25,25,[200,150,110]);rect(p,45,10,8,19);rect(p,62,10,8,19);
 assert.equal(edgeAvatarLeft(b,p,W,H,C,30,4),41);
 assert.equal(edgeAvatarLeft(b,p,W,H,{x:45,samples:2},30,4),null);
 rect(p,27,10,18,19);assert.equal(edgeAvatarLeft(b,p,W,H,C,30,4),null);
});
test('short physically clipped edge excluded, complete short word with margin retained',()=>{
 const p=blank();rect(p,45,0,24,8);rect(p,45,370,18,20);
 assert.equal(clippedEdge({x0:45,x1:69,y0:0,y1:8},p,W,H,C,30),true);
 assert.equal(clippedEdge({x0:45,x1:63,y0:370,y1:390},p,W,H,C,30),false);
});
// Deterministic synthetic scroll canvas; no actual screenshots or private chat.
const world=new Uint8Array(W*1100*4).fill(26);let seed=91;for(let y=0;y<1100;y++){if(y%37<8)continue;for(let x=45;x<225;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed%13<3)world.fill(230,(y*W+x)*4,(y*W+x)*4+3);}}
const evidence=start=>viewportEvidence(world.slice(start*W*4,(start+H)*W*4),W,H,C);
const e=(speaker,time,text,y,extra={})=>({speaker,time,date:'November 27, 2026',reply:null,body:text,lines:[{text,box:box(y)}],uncertain:false,...extra});
const done=(start,entries)=>({state:'done',records:{viewport:evidence(start),entries}});
test('large overlap including shift below old 4% blind zone; reverse and exact duplicates not auto-merged',()=>{
 assert.equal(findViewportOverlap(evidence(0),evidence(12)).shift,12);
 assert.equal(findViewportOverlap(evidence(12),evidence(0)),null);
 assert.equal(findViewportOverlap(evidence(0),evidence(0)),null);
 assert.equal(findViewportOverlap(evidence(0),evidence(500)),null);
});
test('two overlapping message groups over three images stay in order, retain genuinely repeated words in distinct positions',()=>{
 const a=done(0,[e('Alpha','1:00 PM','first message',100),e('Alpha','1:01 PM','same words',250),e('Beta','1:02 PM','second message',320)]);
 const b=done(200,[e('Alpha','1:01 PM','same words',50),e('Beta','1:02 PM','second message',120),e('Alpha','1:03 PM','same words',300)]);
 const c=done(420,[e('Alpha','1:03 PM','same words',80),e('Beta','1:04 PM','last message',200)]);
 const m=mergeQueueRecords([a,b,c]);assert.equal(m.overlaps,2);assert.equal(m.mergedMessages,3);assert.equal(m.text.match(/same words/g).length,2);assert.equal(m.text.match(/second message/g).length,1);assert.match(m.text,/first message[\s\S]*last message/);
 const reverse=mergeQueueRecords([c,b,a]);assert.equal(reverse.overlaps,0);assert.equal(reverse.unresolved,2);
});
test('same display-name glyph evidence across images can reconcile only observed compatible marks',()=>{
 const a=e('[Team] กี','1:00 PM','first message',80,{uncertain:true,nameKey:'same',nameObservations:[{name:'[Team] กี',source:'native'},{name:'[Team] กี่',source:'open-name'}]});
 const b=e('[Team] กี่','1:01 PM','second message',80,{uncertain:true,nameKey:'same',nameObservations:[{name:'[Team] กี่',source:'baseline'}]});
 const m=mergeQueueRecords([done(0,[a]),done(500,[b])]);assert.equal(m.nameLinks,1);assert.equal(m.text.match(/\[Team\] กี่/g).length,2);assert.equal(a.speaker,'[Team] กี');
 assert.equal(mergeQueueRecords([done(0,[a]),done(500,[{...b,nameKey:'other'}])]).nameLinks,0);
 assert.equal(mergeQueueRecords([done(0,[a]),done(500,[{...b,nameObservations:[...b.nameObservations,{name:'[Team] กี้',source:'scaled'}]}])]).nameLinks,0);
});

test('reply marks are recovered from aligned Thai words without replacing visible bullet or ellipsis',()=>{
 const r=assembleTextTranscript([row('reply','@Alpha quote',10),row('reply','เงือนไข ตัวอย่าง » ข้อความ...',40,{replyContinuation:true,candidate:'เงื่อนไข ตัวอย่าง ๑ ข้อความ',baseline:'เงือนไข ตัวอย่าง » ข้อความ...'}),row('header','Beta 11/27/26, 1:00 PM',70),row('body','ตอบแล้ว',100)]);
 assert.equal(r.entries.at(-1).reply,'@Alpha quote\nเงื่อนไข ตัวอย่าง » ข้อความ...');
});
test('mixed right control is cropped, not mistaken for a body suffix; genuine body remains',()=>{
 const p=blank();rect(p,255,300,42,42,[40,40,44]);rect(p,271,311,8,20,[160,161,165]);rect(p,45,309,90,18);
 const rows=[row('body','ข้อความหนึ่ง',100),row('body','ข้อความสอง',145),row('body','ข้อความสาม',190),{kind:'body',text:'ข้อความท้าย',bbox:{x0:45,y0:302,x1:296,y1:342}}];
 const r=refineEdgeRows(rows,p,W,H,C,{cropped:true}).at(-1);assert.equal(r.kind,'body');assert.ok(r.textRight>=252&&r.textRight<=255);assert.equal(r.edgePartial,true);
});
test('a short repeated name stripe alone cannot establish viewport overlap',()=>{
 const rows=Array.from({length:16},(_,i)=>[260+i,i+1,i+21]);const a={w:300,h:400,top:[],bottom:rows};const b={w:300,h:400,top:rows.map(([y,x,z])=>[y-220,x,z]),bottom:[]};assert.equal(findViewportOverlap(a,b),null);
});
