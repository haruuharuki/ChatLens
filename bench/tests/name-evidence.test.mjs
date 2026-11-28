import test from 'node:test';
import assert from 'node:assert/strict';
import {identicalNamePixels,resolveNameEvidence} from '../name-evidence.mjs';
import {trailingBitmap} from '../graphic-edge.mjs';
import {assembleTextTranscript} from '../text-transcript.mjs';
const W=400,H=280;
const box=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
function picture(){const p=new Uint8ClampedArray(W*H*4);for(let i=0;i<p.length;i+=4)p.set([26,26,30,255],i);return p;}
function paint(p,b,c=[30,220,100]){for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)p.set([...c,255],(y*W+x)*4);}
function nameInk(p,y){for(let x=52;x<162;x+=12)paint(p,box(x,y+5,x+5,y+22));}
function header(y,clock,baseline,other='[03] ชื่อผิด | ทดสอบ'){
 const stamp=` ${clock} PM`,text=other+stamp;
 return {kind:'header',bbox:box(40,y,350,y+30),nameROI:box(44,y,180,y+30),layoutHeader:true,text,baseline:baseline+stamp,nameEvidence:{full:text,nearby:text,native:'ชื่ออ่านผิด | ทดสอบ',scaled:'ชื่ออ่านผิด | ทดสอบ',badge:false}};
}
const body=y=>({kind:'body',bbox:box(50,y,200,y+26),text:'ข้อความทดสอบ'});
test('exact repeated raw name pixels permit corroborated observed Latin reading without copying time',()=>{
 const p=picture();nameInk(p,10);nameInk(p,90);nameInk(p,170);
 const a=header(10,'9:30','[03] ชื่อผิด | ทดสอบ'),b=header(90,'9:31','[03] ABC-XYZ | ทดสอบ'),c=header(170,'9:32','[03] ชื่อผิด | ทดสอบ');
 assert.equal(identicalNamePixels(a.nameROI,b.nameROI,p,W,H),true);
 const rows=resolveNameEvidence([a,body(42),b,body(122),c,body(202)],p,W,H);
 const out=assembleTextTranscript(rows);assert.deepEqual(out.entries.map(e=>e.speaker),Array(3).fill('[03] ABC-XYZ | ทดสอบ'));
 assert.deepEqual(out.entries.map(e=>e.time),['9:30 PM','9:31 PM','9:32 PM']);assert.ok(out.warnings.some(x=>x.includes('ตรวจชื่อ')));
});
test('one differing pixel, blank crops, and different sizes do not match',()=>{
 const p=picture();nameInk(p,10);nameInk(p,90);const a=box(44,10,180,40),b=box(44,90,180,120);
 paint(p,box(52,95,53,96),[31,220,100]);assert.equal(identicalNamePixels(a,b,p,W,H),false);
 assert.equal(identicalNamePixels(a,box(44,90,179,120),p,W,H),false);
 assert.equal(identicalNamePixels(a,b,picture(),W,H),false);
});
test('conflicting Latin name observations veto propagation even with identical pixels',()=>{
 const p=picture();nameInk(p,10);nameInk(p,90);nameInk(p,170);
 const a=header(10,'9:30','[03] ชื่อผิด | ทดสอบ'),b=header(90,'9:31','[03] ABC-XYZ | ทดสอบ'),c=header(170,'9:32','[03] DEF-UVW | ทดสอบ');
 const r=resolveNameEvidence([a,b,c],p,W,H);assert.notEqual(r[0].nameResolution.reason,'identical-pixels-bilingual');
});
test('native name preserves a numeric prefix supported by full row, with badge excluded',()=>{
 const p=picture();nameInk(p,10);const a=header(10,'9:30','10 | ชื่อ | ทดสอบ BADGE','เย | ชื่อ | ทดสอบ');
 a.nameEvidence={full:a.baseline,nearby:a.baseline,native:'10 | ชื่อ | ทดสอบ',scaled:'เย | ชื่อ | ทดสอบ',badge:true};
 const r=resolveNameEvidence([a],p,W,H);assert.equal(r[0].nameResolution.speaker,'10 | ชื่อ | ทดสอบ');
});
test('full observed structured prefix survives scaled OCR error',()=>{
 const p=picture();const a=header(10,'9:30','[03] ชื่อ | ทดสอบ','เง | ทดสอบ');a.nameEvidence.full=a.baseline;a.nameEvidence.nearby=a.baseline;
 assert.equal(resolveNameEvidence([a],p,W,H)[0].nameResolution.speaker,'[03] ชื่อ | ทดสอบ');
});
test('only separated filled terminal square is cropped, not a short glyph or sparse graphic',()=>{
 const p=picture(),b=box(45,10,210,50),column={x:50};
 for(let x=50;x<150;x+=12)paint(p,box(x,20,x+4,40),[180,180,180]);
 paint(p,box(165,10,205,50),[235,235,235]);
 assert.equal(trailingBitmap(b,p,W,H,column).cutX,157); // gap between final text ink and square
 const q=picture();paint(q,box(50,20,58,40),[200,200,200]);paint(q,box(165,10,171,50),[235,235,235]);assert.equal(trailingBitmap(b,q,W,H,column),null);
 assert.equal(trailingBitmap(b,p,W,H,null),null);
});
test('reply continuation uses cleaned observed result but remains quoted',()=>{
 const q={kind:'reply',bbox:box(50,5,300,30),text:'@Example ข้อความอ้างอิง'},r={kind:'reply',bbox:box(50,34,180,60),replyContinuation:true,text:'ต่อข้อความ X',baseline:'ต่อข้อความ',candidate:'ต่อข้อความ',bitmap:{cutX:150}};
 const h={kind:'header',bbox:box(50,65,320,90),text:'Example 9:31 PM'};
 const out=assembleTextTranscript([q,r,h,body(92)]);assert.equal(out.entries[0].reply,'@Example ข้อความอ้างอิง\nต่อข้อความ');
});
