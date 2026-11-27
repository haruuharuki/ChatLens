import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverHeaderBands,splitBoxesAtHeaders,combineRecognizedHeader} from '../header-layout.mjs';
const rgba=(w,h)=>{const a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4){a[i]=27;a[i+1]=28;a[i+2]=32;a[i+3]=255;}return a;};
const paint=(a,w,y0,y1,x0,x1,r,g,b)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){let i=(y*w+x)*4;a[i]=r;a[i+1]=g;a[i+2]=b;}};
test('recognize plausible Discord name-color band, not avatar or reply mention',()=>{
 const w=550,h=340,a=rgba(w,h);
 paint(a,w,48,79,49,234,42,197,88); // green author near normal anchor
 paint(a,w,110,148,1,39,42,197,88); // leftover avatar sliver
 paint(a,w,180,205,155,332,42,197,88); // indented reply mention
 paint(a,w,230,244,49,65,42,197,88); // small bright emoji
 const bands=discoverHeaderBands(a,w,h);
 assert.equal(bands.length,1);assert.ok(bands[0].y0<48&&bands[0].y1>78);
});
test('geometry splits a Tesseract header+body mixed region, covers duplicate header',()=>{
 const bands=[{y0:30,y1:79}],width=550;
 const rows=[{kind:'mixed',text:'garbled title body',bbox:{x0:43,y0:39,x1:402,y1:126}},
 {kind:'header',text:'display name 9:31 AM',bbox:{x0:45,y0:40,x1:330,y1:68}},
 {kind:'body',text:'later',bbox:{x0:45,y0:155,x1:350,y1:178}}];
 const r=splitBoxesAtHeaders(rows,bands,width);
 assert.equal(r.split,1);assert.equal(r.covered,1);
 assert.equal(r.lines[0].kind,'body');assert.equal(r.lines[0].needsBodyRead,true);
 assert.equal(r.lines[0].bbox.y0,83);assert.equal(r.lines[0].text,'');
 assert.equal(r.lines[1].kind,'covered');assert.equal(r.lines[2].kind,'body');
});

test('isolated header keeps real numbered username and excludes role-chip nonsense',()=>{
 const x=combineRecognizedHeader({full:'noise [01] ผู้ใช้ตัวอย่าง | นักทดสอบ junk 10:40 AM',nameOnly:'[01] ผู้ใช้ตัวอย่าง | นักทดสอบ',nearby:''});
 assert.deepEqual(x,{text:'[01] ผู้ใช้ตัวอย่าง | นักทดสอบ 10:40 AM',usedNameOnly:true});
});
test('prefer clean isolated name but preserve legitimately numbered usernames',()=>{
 assert.equal(combineRecognizedHeader({full:'9 Sample 9:31 AM',nameOnly:'Sample'}).text,'Sample 9:31 AM');
 assert.equal(combineRecognizedHeader({full:'9 Sample 9:31 AM',nameOnly:'9 Sample'}).text,'9 Sample 9:31 AM');
 assert.equal(combineRecognizedHeader({full:'02 | name 9:48 AM',nameOnly:'02 | name'}).text,'02 | name 9:48 AM');
});
test('never attach invented time and decline obvious OCR gibberish',()=>{
 assert.deepEqual(combineRecognizedHeader({full:'unreadable author',nameOnly:'Multiple'}),{text:'unreadable author',usedNameOnly:false});
 assert.deepEqual(combineRecognizedHeader({full:'[01] Name 10:40 AM',nameOnly:'a a'}),{text:'[01] Name 10:40 AM',usedNameOnly:false});
});