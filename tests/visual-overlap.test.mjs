import test from 'node:test';
import assert from 'node:assert/strict';
import { lumaFromRGBA, detectVisualOverlap } from '../lib/visual-overlap.mjs';

function seededFrame(width=360,height=780,offset=0,seed=0) {
  // Synthetic chat screen with deterministic distinct text-like marks; not real chat data.
  const luma=new Uint8Array(width*height).fill(26);
  for(let y=104;y<694;y++) {
    for(let x=58;x<315;x++) {
      // Stable repeated region with stroke-like pixels. The offset simulates scrolling.
      const key=y+offset;
      const row=Math.floor(key/23);
      const block=Math.floor(x/5);
      const code=(Math.imul(row+17+seed, 1103515245) ^ Math.imul(block+3, 2654435761) ^ Math.imul(row+seed, block+23))>>>0;
      const ink=((key%23)<13 && (code%23<8 || (block*block+row+seed)%31===0)) ? 217 : 26;
      luma[y*width+x]=ink;
    }
  }
  return {width,height,luma};
}

test('luma converter retains source and outputs brightness channel',()=>{
  const p=new Uint8ClampedArray([255,255,255,255,0,0,0,255]);
  assert.deepEqual([...lumaFromRGBA(p,2,1)],[255,0]);
  assert.equal(p[0],255);
});

test('aligned screenshots with scrolling detect a conservative OCR start',()=>{
  const a=seededFrame(360,780,0), b=seededFrame(360,780,340);
  const match=detectVisualOverlap(a,b);
  assert.ok(match, 'visual overlap should be found');
  assert.ok(match.similarity>=.88);
  assert.ok(match.skipUntilRatio>.29 && match.skipUntilRatio<.5);
});

test('different chat contents are not treated as repeated screenshots',()=>{
  const a=seededFrame(360,780,0,0), b=seededFrame(360,780,340,9);
  assert.equal(detectVisualOverlap(a,b),null);
});

test('invalid size and low information cannot erase content',()=>{
  const a=seededFrame();
  assert.equal(detectVisualOverlap(a,{width:360,height:780,luma:new Uint8Array(360*780).fill(26)}),null);
  assert.equal(detectVisualOverlap(a,{width:300,height:650,luma:new Uint8Array(300*650)}),null);
  assert.equal(detectVisualOverlap(null,a),null);
});
