import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {benchmarkCropRect} from '../safe-crop.mjs';
import {discoverHeaderBands,splitBoxesAtHeaders} from '../header-layout.mjs';
const js=readFileSync(new URL('../batch.js',import.meta.url),'utf8');
test('both mobile aspect ratios keep more top, left and bottom than D.1c',()=>{
 for(const [w,h] of [[1488,2266],[1206,2622]]){
  const c=benchmarkCropRect(w,h);assert.ok(c.cropped);
  assert.ok(c.x<Math.round(w*.095));assert.ok(c.y<Math.round(h*.133));
  assert.ok(c.y+c.height>h-Math.round(h*.112));assert.equal(c.x+c.width,w);
 }
});
test('safe crop preserves representative near-edge synthetic text at 9 percent and header at 12 percent',()=>{
 const w=1500,h=2300,c=benchmarkCropRect(w,h);
 assert.ok(c.x<135);assert.ok(c.y<276);assert.ok(c.y+c.height>2000);
});
test('opt-out and non-mobile use whole image',()=>{
 assert.deepEqual(benchmarkCropRect(1488,2266,false),{x:0,y:0,width:1488,height:2266,cropped:false});
 assert.deepEqual(benchmarkCropRect(1200,700),{x:0,y:0,width:1200,height:700,cropped:false});
 assert.throws(()=>benchmarkCropRect(0,500));
});
test('cropped-frame header search includes near-left name pixels without changing full-frame default',()=>{
 const w=500,h=200,a=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<a.length;i+=4)a.set([26,26,26,255],i);
 for(let y=45;y<65;y++)for(let x=18;x<170;x++)a.set([42,197,88,255],(y*w+x)*4);
 const b=discoverHeaderBands(a,w,h,{leftFraction:.025});
 assert.equal(b.length,1);assert.ok(b[0].x0<=18);assert.ok(b[0].nameStart<=19);
 const old=discoverHeaderBands(a,w,h);assert.ok(old[0].x0>18);
});
test('split header and body retains actual left edge rather than a second fixed crop',()=>{
 const rows=[{kind:'mixed',text:'Example',bbox:{x0:18,y0:20,x1:300,y1:100}}];
 const r=splitBoxesAtHeaders(rows,[{y0:18,y1:45}],500);
 assert.equal(r.split,1);assert.equal(r.lines[0].bbox.x0,18);
});
test('browser uses conservative crop and disables both additional left masks',()=>{
 assert.match(js,/const detected=.*conversationCrop\(/);
 assert.match(js,/anchorX:null/);assert.match(js,/enableAvatarGuard:false/);
 assert.doesNotMatch(js,/bodyTextAnchor/);
 assert.match(js,/leftFraction:cropApplied\?\.025:\.07/);
});
