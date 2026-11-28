import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inferTextColumn,safeTextLeft,allowVerticalBand} from '../smart-region.mjs';
const row=(x,y,extra={})=>({kind:'body',bbox:{x0:x,y0:y,x1:x+200,y1:y+30},...extra});
test('infer a consistent positive start despite zero-edge and split boxes',()=>{
 const rows=[row(49,10),row(0,50),row(48,90),row(49,130),row(48,170),row(200,210,{splitBody:true}),row(49,250)];
 assert.deepEqual(inferTextColumn(rows,1400),{x:49,samples:5});
});
test('reject sparse, duplicated, conflicting columns',()=>{
 assert.equal(inferTextColumn([row(49,10),row(49,10),row(49,10),row(49,10)],1400),null);
 assert.equal(inferTextColumn([row(49,10),row(49,50),row(200,90),row(200,130)],1400),null);
 assert.equal(inferTextColumn([row(0,10),row(0,50),row(0,90),row(0,130)],1400),null);
});
const w=400,h=80,box={x0:0,y0:15,x1:250,y1:55},column={x:49,samples:5};
function pixels(paint){const p=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)p.set([...paint(x,y),255],(y*w+x)*4);return p;}
const scene=(x,y)=>x<24&&y>18&&y<50?[220,160,40]:x>=49&&x<210&&y>25&&y<45?[230,230,230]:[26,26,26];
test('remove colored left debris only with a real gutter and text beyond it; pixels unmodified',()=>{
 const p=pixels(scene),before=p.slice();assert.equal(safeTextLeft(p,w,h,box,column),40);assert.deepEqual(p,before);
});
test('keep aligned crops, missing anchor, ambiguous ink crossing gutter, and noncolored prefix',()=>{
 const p=pixels(scene);assert.equal(safeTextLeft(p,w,h,{...box,x0:48},column),null);assert.equal(safeTextLeft(p,w,h,box,null),null);
 assert.equal(safeTextLeft(pixels((x,y)=>x===40&&y===30?[150,150,150]:scene(x,y)),w,h,box,column),null);
 assert.equal(safeTextLeft(pixels((x,y)=>x<24&&y>18&&y<50?[230,230,230]:scene(x,y)),w,h,box,column),null);
});
test('preserve vertical extent for standalone body and already separated mixed crop',()=>{
 assert.equal(allowVerticalBand('body',false),false);assert.equal(allowVerticalBand('mixed',{}),false);assert.equal(allowVerticalBand('mixed',false),true);
 const js=readFileSync(new URL('../batch.js',import.meta.url),'utf8');assert.match(js,/if\(allowVerticalBand\(line.kind,mixedBand\)&&cleaned.band/);assert.match(js,/geometry&&line.kind==='body'\?safeTextLeft/);
});
