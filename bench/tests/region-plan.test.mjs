import test from 'node:test';
import assert from 'node:assert/strict';
import {redundantSplit,tightenRecovery,classifyStructure,isolateNameBox,needsAlternateReading,alternateMatches} from '../region-plan.mjs';
import {assembleTextTranscript,formatTextTranscript} from '../text-transcript.mjs';
import {combineRecognizedHeader} from '../header-layout.mjs';
const W=500,H=600,column={x:50,samples:5};
const box=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
const row=(kind,bbox,text='ข้อความตัวอย่าง',extras={})=>({kind,bbox,text,...extras});
const picture=()=>{const p=new Uint8ClampedArray(W*H*4);for(let i=0;i<p.length;i+=4)p.set([26,26,30,255],i);return p;};
const paint=(p,b,rgb)=>{for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)p.set([...rgb,255],(y*W+x)*4);};
const textInk=(p,b,rgb=[230,230,230])=>{for(let x=b.x0;x<b.x1;x+=9)paint(p,box(x,b.y0,Math.min(x+3,b.x1),b.y1),rgb);};
test('skip split before OCR only if all visible text fits one standalone region',()=>{
 const p=picture(),main=row('body',box(50,102,170,132)),split=row('body',box(0,100,300,134),'',{needsBodyRead:true});
 textInk(p,box(51,105,169,130));paint(p,box(0,110,25,130),[210,160,30]);
 assert.equal(redundantSplit(split,[main],p,W,H,column),main);
 assert.equal(redundantSplit(split,[main],p,W,H,null),null);
 assert.equal(redundantSplit(split,[main,{...main}],p,W,H,column),null);
 paint(p,box(240,112,245,123),[210,210,210]);assert.equal(redundantSplit(split,[main],p,W,H,column),null);
});
test('outside ink even above the primary padded box keeps recovery',()=>{
 const p=picture(),main=row('body',box(50,110,170,132)),split=row('body',box(0,100,300,134),'',{needsBodyRead:true});
 textInk(p,box(51,112,169,130));paint(p,box(65,100,69,102),[230,230,230]);
 assert.equal(redundantSplit(split,[main],p,W,H,column),null);
});
test('right trim only removes blank tail and keeps separated ink',()=>{
 const p=picture(),b=box(0,100,470,135);textInk(p,box(50,110,100,127));paint(p,box(250,112,255,121),[150,150,150]);
 assert.equal(tightenRecovery(b,p,W,H,column).x1,262);
 assert.equal(tightenRecovery(b,p,W,H,null),b);assert.equal(tightenRecovery(b,picture(),W,H,column),b);
});
test('gray wrapped quote belongs to next verified header, white real body remains body',()=>{
 const p=picture();const rows=[row('reply',box(50,100,420,132),'@Example quoted'),row('body',box(50,135,130,164),'ต่อข้อความ'),row('header',box(43,168,470,202),'Example 10:30 PM'),row('body',box(50,205,180,232),'ข้อความจริง')];
 textInk(p,box(50,140,125,160),[159,159,163]);
 let r=classifyStructure(rows,p,W,H,column);assert.equal(r[1].kind,'reply');assert.equal(r[1].replyContinuation,true);
 const out=formatTextTranscript(assembleTextTranscript(r));assert.match(out,/> ตอบกลับ: @Example quoted\n> ต่อข้อความ\n\[Example\]/);assert.match(out,/ข้อความจริง/);
 textInk(p,box(50,140,125,160),[240,240,240]);r=classifyStructure(rows,p,W,H,column);assert.equal(r[1].kind,'body');
});
test('untimed indented colored quote with small avatar is not a new author',()=>{
 const p=picture(),r=row('header',box(50,100,420,140),'garbled quote'),n=row('header',box(43,147,470,180),'Example 10:30 PM');
 paint(p,box(50,104,81,136),[180,150,80]);textInk(p,box(95,110,173,130),[30,200,90]);textInk(p,box(190,110,400,130),[159,159,163]);
 assert.equal(classifyStructure([r,n],p,W,H,column)[0].kind,'reply');assert.equal(classifyStructure([r],p,W,H,column)[0].kind,'header');
});
test('gray controls are reviewable graphics but short text remains text',()=>{
 const p=picture(),a=row('fragment',box(460,540,490,570),'NZ'),b=row('fragment',box(100,500,170,530),'6 @'),c=row('fragment',box(50,455,80,480),'OK');
 paint(p,a.bbox,[43,43,47]);paint(p,b.bbox,[43,43,47]);textInk(p,box(468,545,484,566),[140,140,145]);textInk(p,box(50,460,77,475));
 const r=classifyStructure([a,b,c],p,W,H,column);assert.deepEqual(r.map(x=>x.kind),['fragment','graphic','graphic']);
});
test('isolate colored name and exclude a raised badge background without hardcoded labels',()=>{
 const p=picture(),b=box(40,100,490,140);textInk(p,box(50,105,180,135),[30,200,90]);paint(p,box(190,104,250,136),[49,49,54]);paint(p,box(201,111,220,125),[40,205,80]);textInk(p,box(265,110,350,130),[155,155,160]);
 const n=isolateNameBox(b,p,W,H,column);assert.ok(n);assert.ok(n.x0<=50&&n.x1<=190&&n.x1>=180);assert.equal(isolateNameBox(b,p,W,H,null),null);
 assert.equal(combineRecognizedHeader({full:'9 Example 10:30 PM',nearby:'9 Example 10:30 PM',nameOnly:'Example',trustedNameGeometry:true}).text,'Example 10:30 PM');
 assert.equal(combineRecognizedHeader({full:'[01] Example 10:30 PM',nearby:'[01] Example 10:30 PM',nameOnly:'Example',trustedNameGeometry:true}).text,'[01] Example 10:30 PM');
});
test('backup is needed for disagreement/error, not punctuation/spacing alone',()=>{
 assert.equal(needsAlternateReading('OK!','OK'),false);assert.equal(needsAlternateReading('ทำ','ทํา'),false);assert.equal(needsAlternateReading('ดมาก','ดีมาก'),true);assert.equal(needsAlternateReading('OK','',true),true);
 const main=row('body',box(50,100,170,130));assert.equal(alternateMatches({alternateBody:true,primaryBox:main.bbox},main),true);assert.equal(alternateMatches({alternateBody:true,primaryBox:box(50,140,170,170)},main),false);
});
