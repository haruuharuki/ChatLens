import test from 'node:test';import assert from 'node:assert/strict';
import {maskNonTextColors} from '../text-color-mask.mjs';
const bytes=(items)=>Uint8ClampedArray.from(items.flatMap(v=>[...v,255]));
test('keep glyph white gray green purple, discard photo-orange and dark, mask left avatar sliver',()=>{
 const a=bytes([[22,22,27],[245,245,246],[160,160,164],[44,199,70],[123,138,245],[225,110,60]]);
 const r=maskNonTextColors(a,6,1,{blackoutLeft:1});
 assert.deepEqual(Array.from(r.pixels.slice(0,3)),[27,28,32]);
 assert.deepEqual(Array.from(r.pixels.slice(4,7)),[245,245,246]);
 assert.deepEqual(Array.from(r.pixels.slice(8,11)),[160,160,164]);
 assert.deepEqual(Array.from(r.pixels.slice(12,15)),[44,199,70]);
 assert.deepEqual(Array.from(r.pixels.slice(16,19)),[123,138,245]);
 assert.deepEqual(Array.from(r.pixels.slice(20,23)),[27,28,32]);
});
test('opt-out preserves original RGB unchanged',()=>{
 const a=bytes([[33,100,170],[100,210,20]]);const b=maskNonTextColors(a,2,1,{enabled:false});
 for(let i=0;i<a.length;i++)assert.equal(a[i],b.pixels[i]);
});
test('invalid dimensions do not silently process wrong pixels',()=>assert.throws(()=>maskNonTextColors(new Uint8Array(3),5,5),/Invalid/));
