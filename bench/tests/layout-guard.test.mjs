import test from 'node:test';
import assert from 'node:assert/strict';
import {inferBodyTextAnchor,trailingDecorationCut,isolateBodyLayoutRGBA,referenceHasArtworkNotes} from '../layout-guard.mjs';

const row=(x,kind='body')=>({kind,bbox:{x0:x,x1:x+300,y0:10,y1:40}});
function pic(w,h,paint=(x,y)=>[26,26,26]){
 const p=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)p.set([...paint(x,y),255],(y*w+x)*4);
 return p;
}
const pixel=(p,w,x,y)=>Array.from(p.slice((y*w+x)*4,(y*w+x)*4+3));

test('body-column estimate resists one contaminated avatar box',()=>{
 const a=inferBodyTextAnchor([row(140),row(142),row(138),row(12),row(144),row(141,'reply')],1000);
 assert.equal(a,142);
});
test('no layout crop inferred from sparse lines or contradictory positions',()=>{
 assert.equal(inferBodyTextAnchor([row(40),row(120)],1000),null);
 assert.equal(inferBodyTextAnchor([row(15),row(110),row(240),row(360)],1000),null);
});
test('mask avatar strip without losing main white text; original unchanged',()=>{
 const w=420,h=45,src=pic(w,h,(x)=>x<100?[236,211,205]:x>121&&x<360?[226,226,226]:[26,26,26]);
 const out=isolateBodyLayoutRGBA(src,w,h,{absoluteX:14,anchorX:143});
 assert.ok(out.leftCut>=120);
 assert.deepEqual(pixel(out.pixels,w,15,20),[26,26,26]);
 assert.deepEqual(pixel(out.pixels,w,200,20),[226,226,226]);
 assert.deepEqual(pixel(src,w,15,20),[236,211,205]);
});
test("don't trim the left of an ordinary crop aligned to text column",()=>{
 const p=pic(260,40,(x,y)=>x<30&&y>10&&y<30?[240,240,240]:[26,26,26]);
 const out=isolateBodyLayoutRGBA(p,260,40,{absoluteX:130,anchorX:140});
 assert.equal(out.leftCut,0);assert.deepEqual(out.pixels,p);
});
test('find near-white flat square at end (monochrome emoji with white background)',()=>{
 const w=320,h=52,p=pic(w,h,(x,y)=>x>=271&&x<318&&y>=3&&y<49?[246,246,246]:[26,26,26]);
 const x=trailingDecorationCut(p,w,h);
 assert.equal(x?.type,'light-image');
 assert.ok(x.x>=230&&x.x<=288);
 const out=isolateBodyLayoutRGBA(p,w,h);
 assert.deepEqual(pixel(out.pixels,w,310,24),[26,26,26]);
});
test('find high-saturation emoji at end, preserving text before it',()=>{
 const w=330,h=52,p=pic(w,h,(x,y)=>x>=281&&y>=3&&y<49?[240,189,19]:x>=30&&x<220&&y>=18&&y<31?[235,235,235]:[26,26,26]);
 const x=trailingDecorationCut(p,w,h);
 assert.equal(x?.type,'colored-image');
 const out=isolateBodyLayoutRGBA(p,w,h);
 assert.deepEqual(pixel(out.pixels,w,313,23),[26,26,26]);
 assert.deepEqual(pixel(out.pixels,w,190,23),[235,235,235]);
});
test('do not trim normal white glyph strokes or a colored mention in middle',()=>{
 const p=pic(320,50,(x,y)=>((x>20&&x<270&&x%14<4&&y>8&&y<41)?[231,231,231]:x>150&&x<180&&y>8&&y<41?[30,210,90]:[26,26,26]));
 assert.equal(trailingDecorationCut(p,320,50),null);
});
test('recognize descriptive artwork annotations but keep legitimate literal text',()=>{
 assert.equal(referenceHasArtworkNotes('ตัวอย่างคำพูด (อิโมจิที่ถูกลบไม่หมด)'),true);
 assert.equal(referenceHasArtworkNotes('ประโยค (โปรไฟล์)'),true);
 assert.equal(referenceHasArtworkNotes('อยากไปดูค่ะ'),false);
 assert.equal(referenceHasArtworkNotes('ข้อความพูดถึงอิโมจิ'),false);
});
