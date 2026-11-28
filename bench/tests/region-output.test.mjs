import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleTextTranscript,formatTextTranscript} from '../text-transcript.mjs';
import {selectBilingualText,sameBodyRegion} from '../region-output.mjs';
import {combineRecognizedHeader,splitBoxesAtHeaders} from '../header-layout.mjs';
const r=(kind,text,x0,y0,x1,y1,extra={})=>({kind,text,bbox:{x0,y0,x1,y1},...extra});
const head=r('header','Example 9:31 AM',50,10,350,30);
const result=(...rows)=>assembleTextTranscript([head,...rows]);
const body=(...rows)=>result(...rows).entries[0].body;
test('split crop plus standalone OCR of same physical line exports once, prefers dedicated candidate',()=>{
 const original=r('mixed','Example 9:31 AM ข้อความทดสอบ',50,10,400,60);
 const a=splitBoxesAtHeaders([original],[{y0:10,y1:30}],600).lines[0];
 assert.ok(a.splitBody);assert.deepEqual(a.sourceBodyBox,a.bbox);
 const split={...a,text:'ขอความทดสอบ',candidate:'ขอความทดสอบ',bbox:{...a.bbox,x1:570}};
 const separate=r('body','ข้อความทดสอบ',50,37,390,60,{candidate:'ข้อความทดสอบ'});
 const out=result(split,separate);assert.equal(out.entries[0].body,'ข้อความทดสอบ');assert.equal(out.duplicateCount,1);
});
test('overlapping same-size OCR alternatives are not repeated even if OCR spellings differ',()=>{
 assert.equal(body(r('body','ตัวอยางข้อความ',50,40,300,60),r('body','ตัวอย่างข้อความ',52,42,302,62,{candidate:'ตัวอย่างข้อความ'})),'ตัวอย่างข้อความ');
});
test('identical physical speech in different rows and columns remains intact',()=>{
 assert.equal(body(r('body','สวัสดี',50,40,180,60),r('body','สวัสดี',50,67,180,87)),'สวัสดี\nสวัสดี');
 assert.equal(body(r('body','OK',50,40,90,60),r('body','OK',140,40,180,60)),'OK\nOK');
});
test('header fallback tail is suppressed only when source rectangle overlaps a corroborating body',()=>{
 const h=r('header','Example 9:31 AM ตัวอย่างข้อความ',50,10,350,30,{headerTailBox:{x0:50,y0:10,x1:400,y1:65}});
 const b=r('body','ตัวอย่างข้อความ',50,40,300,60,{candidate:'ตัวอย่างข้อความ'});
 const x=assembleTextTranscript([h,b]);assert.equal(x.entries[0].body,'ตัวอย่างข้อความ');assert.equal(x.duplicateCount,1);
 const y=assembleTextTranscript([h,{...b,bbox:{...b.bbox,y0:80,y1:100}}]);assert.equal(y.entries[0].body,'ตัวอย่างข้อความ\nตัวอย่างข้อความ');
 assert.equal(assembleTextTranscript([h]).entries[0].body,'ตัวอย่างข้อความ');
});
test('mixed row does not duplicate a separately detected body; unique fallback remains',()=>{
 const m=r('mixed','Example 9:31 AM ข้อความทดสอบ',50,10,400,65,{bodyOnly:true,bodyBand:{top:25,bottom:55},baseline:'ข้อความทดสอบ',candidate:'ขอความทดสอบ'});
 const b=r('body','ข้อความทดสอบ',50,40,300,60,{candidate:'ข้อความทดสอบ'});
 assert.equal(assembleTextTranscript([m,b]).entries[0].body,'ข้อความทดสอบ');
 assert.equal(assembleTextTranscript([m]).entries[0].body,'ขอความทดสอบ');
 assert.equal(assembleTextTranscript([{...m,bodyOnly:false,candidate:'Example 9:31 AM ข้อความทดสอบ'}]).entries[0].body,'ข้อความทดสอบ');
});
test('manual body correction wins within a region and different speaker boundary is preserved',()=>{
 const a=r('body','อ่านผิด',50,40,300,60,{truth:'แก้แล้ว'});
 const b=r('body','อ่านผิด',50,40,300,60,{candidate:'อ่านผิด'});
 assert.equal(body(a,b),'แก้แล้ว');
 const x=assembleTextTranscript([head,a,r('header','Tester 9:32 AM',50,70,350,90),r('body','แก้แล้ว',50,100,300,120)]);
 assert.equal(x.entries.length,2);
});
test('mixed Thai + English preserves a corroborated missing Latin word without inventing text',()=>{
 assert.equal(selectBilingualText('ไปเล่นเกมกัน','ไปเล่น game เกมกัน','ไปเล่น game เกมกัน'),'ไปเล่น game เกมกัน');
 assert.equal(selectBilingualText('ไปเล่นเกมกัน','ไปเล่น game เกมกัน','ไปเล่นเกมกัน'),'ไปเล่นเกมกัน');
 assert.equal(selectBilingualText('ไปเล่น game กัน','ไปเล่น game กัน'),'ไปเล่น game กัน');
 assert.equal(selectBilingualText('โอเค','OK','OK'),'OK');
 assert.equal(selectBilingualText('โอเค','OK','ไม่ชัด'),'โอเค');
 const a=r('body','ไปเล่น game กัน',50,40,300,60,{candidate:'ไปเล่นกัน',baseline:'ไปเล่น game กัน'});
 assert.equal(body(a),'ไปเล่น game กัน');
 assert.equal(body(r('fragment','OK',50,40,90,60,{baseline:'OK',candidate:'OK'})),'OK');
});
test('mixed username retains corroborated Latin prefix but not unverified role suffix',()=>{
 const x=combineRecognizedHeader({full:'[01] ABC-XYZ | นักทดสอบ 9:31 AM',nearby:'[01] ABC-XYZ | นักทดสอบ 9:31 AM',nameOnly:'[01] เอบีซี | นักทดสอบ'});
 assert.equal(x.text,'[01] ABC-XYZ | นักทดสอบ 9:31 AM');
 const y=combineRecognizedHeader({full:'นักทดสอบ TTO 9:31 AM',nearby:'นักทดสอบ TTO 9:31 AM',nameOnly:'นักทดสอบ'});
 assert.equal(y.text,'นักทดสอบ 9:31 AM');
});

test('diagnostic-only intervening regions do not interrupt body resolution',()=>{
 const a=r('body','ข้อความทดสอบ',50,40,300,60,{candidate:'ข้อความทดสอบ'});
 const b=r('body','ข้อความทดสอบ',50,42,300,62,{splitBody:true});
 const g=r('covered','ignored',50,41,300,61);
 assert.equal(body(a,g,b),'ข้อความทดสอบ');
});
test('ambiguous wider body with distinct text is not silently removed',()=>{
 const a=r('body','ข้อความสั้น',50,40,120,60);
 const b=r('body','อีกข้อความที่มีส่วนต่อท้าย',50,40,400,60);
 assert.equal(body(a,b),'ข้อความสั้น\nอีกข้อความที่มีส่วนต่อท้าย');
});
