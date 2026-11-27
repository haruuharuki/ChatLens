import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBatchLines,compareRuns,normalizedEqual,safeBatchReport,MAX_BATCH_LINES} from '../batch-core.mjs';

const row=(text,index)=>({text,bbox:{x0:100,y0:index*40,x1:500,y1:index*40+28}});
test('samples up to 12 body lines distributed across screenshot',()=>{
 const lines=Array.from({length:28},(_,i)=>row('ข้อความบทสนทนาไทยตัวอย่าง '+i,i));
 const rows=chooseBatchLines(lines);
 assert.equal(rows.length,12);
 assert.equal(rows[0].index,0);assert.equal(rows.at(-1).index,27);
 assert.ok(rows.every((v,i)=>i===0||v.index>rows[i-1].index));
});
test('body-only selection excludes timestamp headers and reply mention, all retains both',()=>{
 const lines=[row('คนแรก 1:55 PM',0),row('@Someone คำตอบของเขาคือ',1),row('พูดคุยภาษาไทยได้เลย',2),row('ข้อความอีกหนึ่งบรรทัด',3)];
 assert.deepEqual(chooseBatchLines(lines,'bodyall').map(x=>x.index),[2,3]);
 assert.deepEqual(chooseBatchLines(lines,'all').map(x=>x.index),[0,1,2,3]);
});
test('empty/invalid lines and overly large batches handled safely',()=>{
 assert.deepEqual(chooseBatchLines(null),[]);
 assert.deepEqual(chooseBatchLines([null,{text:''}], 'all'),[]);
 assert.throws(()=>chooseBatchLines([], 'unknown'),/mode/);
 assert.equal(chooseBatchLines(Array.from({length:80},(_,i)=>row('ภาษาไทยอะไรสักอย่าง',i)),'all').length,MAX_BATCH_LINES);
});
test('Thai normalization compares identical strings and preserves changed codepoints',()=>{
 assert.equal(normalizedEqual('ทํา','ทำ'),true);
 const r=compareRuns('อากาศดีจิง','อากาศดีจริง');
 assert.equal(r.identical,false);
 assert.ok(r.left.some(x=>x.changed));
 assert.ok(r.right.some(x=>x.changed));
 assert.equal(r.left.map(x=>x.text).join(''),'อากาศดีจิง');
 assert.equal(r.right.map(x=>x.text).join(''),'อากาศดีจริง');
});
test('insertions, empty and emoji use grapheme runs and preserve source',()=>{
 const r=compareRuns('ทดสอบ 👍','ทดสอบ 👍👍');
 assert.equal(r.identical,false);
 assert.equal(r.left.map(x=>x.text).join(''),'ทดสอบ 👍');
 assert.equal(r.right.map(x=>x.text).join(''),'ทดสอบ 👍👍');
 assert.equal(compareRuns('','').identical,true);
});
test('identical output has no highlighted runs',()=>{
 const r=compareRuns('สวัสดี','สวัสดี');
 assert.equal(r.identical,true);assert.ok(r.left.every(x=>!x.changed));
});
test('long OCR strings are bounded to avoid quadratic blowups',()=>{
 const r=compareRuns('ก'.repeat(500),'ข'.repeat(500));
 assert.equal(r.identical,false);assert.equal(r.left[0].text.length,500);
});
test('diagnostic summary excludes private chat data',()=>{
 const report=safeBatchReport({detected:20,selected:12,completed:11,identical:5,different:6,failures:1,cancelled:false,tesseractMs:1500,modelLoadMs:2300,inferenceMs:520,withTruth:3,filename:'private.png',text:'CONFIDENTIAL'});
 assert.match(report,/selected lines: 12/);
 assert.doesNotMatch(report,/private|CONFIDENTIAL/);
});
test('recognized headers and reply previews are excluded from default sampling but reviewable in all mode',()=>{
 const candidates=[
  {...row('ข้อความอ้างอิงของคนก่อน',0),kind:'reply'},
  {...row('ชื่อและยศผู้ใช้อยู่ตรงนี้',1),kind:'header'},
  {...row('พ a',2),kind:'fragment'},
  {...row('บทสนทนาที่ยาวเพียงพอ',3),kind:'body'}
 ];
 assert.deepEqual(chooseBatchLines(candidates,'sample12').map(x=>x.index),[3]);
 assert.deepEqual(chooseBatchLines(candidates,'all').map(x=>x.index),[0,1,2,3]);
});

test('image-only region remains reviewable but never automatically read in all mode',()=>{
 const lines=[{...row('a',0),kind:'graphic'},{...row('บทสนทนาที่ยาวพอ',1),kind:'body'}];
 assert.deepEqual(chooseBatchLines(lines,'all').map(x=>x.index),[1]);
});
test('mixed header+body box is eligible for a body test after safe band segmentation',()=>{
 const lines=[{...row('Multiple 9:31 AM มีใครดูใหม่',0),kind:'mixed'},
 {...row('Multiple 9:32 AM',1),kind:'header'}];
 assert.deepEqual(chooseBatchLines(lines,'bodyall').map(x=>x.index),[0]);
});
