import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportEvidence,findViewportOverlap,captureQueueEvidence,mergeQueueRecords} from '../queue-merge.mjs';
import {assembleTextTranscript} from '../text-transcript.mjs';
import {runImageQueue,formatQueueTranscript} from '../image-queue.mjs';
const w=300,h=400,shift=280,col={x:45};
function world(){const p=new Uint8Array(w*1000*4);p.fill(26);let seed=12345;for(let y=0;y<1000;y++){if(y%33<8)continue;for(let x=50;x<220;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;if(seed%11<3)p.fill(230,(y*w+x)*4,(y*w+x)*4+3);}}return p;}
const pixels=world();const view=(start)=>pixels.slice(start*w*4,(start+h)*w*4);
const evidence=start=>viewportEvidence(view(start),w,h,col);
const box=(y,x=45,x1=220)=>({x0:x,y0:y,x1,y1:y+22});
const line=(text,y,extra={})=>({text,box:box(y),paragraph:false,edge:false,side:false,...extra});
const entry=(speaker,time,lines,extra={})=>({speaker,time,date:'November 26, 2026',reply:null,body:lines.map(l=>l.text).join('\n'),lines,uncertain:false,...extra});
const done=(start,entries)=>({state:'done',text:'raw',records:{viewport:evidence(start),entries}});
const mark={dateMarker:'November 26, 2026'};
test('shift is supported by informative image rows, not OCR text',()=>{const a=findViewportOverlap(evidence(0),evidence(shift));assert.equal(a.shift,shift);assert.ok(a.support>=14);assert.equal(findViewportOverlap(evidence(0),evidence(550)),null);});
test('structured records contain source geometry and no raw image or canvas',()=>{
 const r=assembleTextTranscript([{kind:'header',bbox:box(20),text:'Alpha 11/26/26, 1:49 PM'},{kind:'body',bbox:box(55),text:'hello world'},{kind:'body',bbox:box(90),text:'next line',paragraphBefore:true}]);
 const e=captureQueueEvidence(r,[],view(0),w,h,col);assert.equal(e.entries[1].lines.length,2);assert.deepEqual(e.entries[1].headerBox,box(20));assert.equal(e.entries[1].lines[1].paragraph,true);assert.doesNotMatch(JSON.stringify(e),/canvas|pixels|filename/i);
});
test('clipped speaker and spurious isolated right edge: one message, observed name recovered',()=>{
 const a=entry('Alpha','1:49 PM',[line('cursedมาก',310),line('ง',340,{box:box(340,270,282),side:true})],{atBottom:true});
 const b=entry(null,'1:49 PM',[line('cursed มาก',30)],{atTop:true,uncertain:true});
 const c=entry('Beta','1:49 PM',[line('different',100)]);
 const r=mergeQueueRecords([done(0,[mark,a]),done(shift,[mark,b,c])]);assert.equal(r.overlaps,1);assert.equal(r.mergedMessages,1);assert.equal(r.text.match(/cursed มาก/g).length,1);assert.doesNotMatch(r.text,/\nง\n/);assert.match(r.text,/\[Alpha\] - 1:49 PM\ncursed มาก/);assert.match(r.text,/\[Beta\]/);
});
test('same visual overlap restores truncated line and following lines; no invented text',()=>{
 const a=entry('Alpha','1:53 PM',[line('ข้อความตัวอย่างยาวมากกว่าปกติเมื่:',320)],{atBottom:true,uncertain:true});
 const b=entry('Alpha','1:53 PM',[line('ข้อความตัวอย่างยาวมากกว่าปกติเมื่อ',40),line('หลายวันก่อน',75),line('จบแล้ว',110)],{atTop:true});
 const r=mergeQueueRecords([done(0,[mark,a]),done(shift,[mark,b])]);assert.equal(r.mergedMessages,1);assert.match(r.text,/เมื่อ\nหลายวันก่อน\nจบแล้ว/);assert.doesNotMatch(r.text,/เมื่:/);
});
test('same time or same text without visual overlap is never deduplicated',()=>{const a=entry('A','1:49 PM',[line('same words',310)]);const b=entry('A','1:49 PM',[line('same words',30)]);const r=mergeQueueRecords([done(0,[a]),done(550,[b])]);assert.equal(r.mergedMessages,0);assert.equal(r.text.match(/same words/g).length,2);assert.equal(r.unresolved,1);});
test('different confident authors or time veto visual merge',()=>{const a=entry('A','1:49 PM',[line('same words',310)]);for(const b of [entry('B','1:49 PM',[line('same words',30)]),entry('A','1:50 PM',[line('same words',30)])])assert.equal(mergeQueueRecords([done(0,[a]),done(shift,[b])]).mergedMessages,0);});
test('same minute but different body stays separate even when viewport matches',()=>{const a=entry('A','1:49 PM',[line('completely different words',310)]);const b=entry('A','1:49 PM',[line('another unrelated statement',30)]);assert.equal(mergeQueueRecords([done(0,[a]),done(shift,[b])]).mergedMessages,0);});
test('failed/partial images are explicit boundaries and never bridged',()=>{const a=entry('A','1:49 PM',[line('same words',310)]),b=entry('A','1:49 PM',[line('same words',30)]);const r=mergeQueueRecords([done(0,[a]),{state:'partial',text:'partial only'},done(shift,[b])]);assert.equal(r.mergedMessages,0);assert.match(r.text,/ผลบางส่วน/);assert.equal(r.text.match(/same words/g).length,2);});
test('exact name evidence can reuse a uniquely reliable observed spelling; conflicting names stay unchanged',()=>{const a=entry('Alpha','1:49 PM',[line('one',310)],{nameKey:'exact'});const b=entry('Alpba','1:50 PM',[line('two',30)],{nameKey:'exact',uncertain:true});const r=mergeQueueRecords([done(0,[a]),done(550,[b])]);assert.equal(r.nameLinks,1);assert.match(r.text,/\[Alpha\] - 1:50 PM/);assert.equal(b.speaker,'Alpba');const c=entry('Other','1:51 PM',[line('three',50)],{nameKey:'exact'});assert.equal(mergeQueueRecords([done(0,[a]),done(550,[b,c])]).nameLinks,0);});
test('queue passes structured results through before releasing image-local state',async()=>{const a=done(0,[entry('A','1:49 PM',[line('same words',310)])]),b=done(shift,[entry('A','1:49 PM',[line('same words',30)])]);const r=await runImageQueue([a,b],{read:async x=>x});assert.equal(formatQueueTranscript(r).match(/same words/g).length,1);});
