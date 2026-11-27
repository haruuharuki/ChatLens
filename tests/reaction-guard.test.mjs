import test from 'node:test';
import assert from 'node:assert/strict';
import { findReactionRows } from '../lib/reaction-guard.mjs';

const W=600, H=480;
const makeImage = () => {
  const a=new Uint8ClampedArray(W*H*4);
  for(let i=0;i<a.length;i+=4){a[i]=26;a[i+1]=25;a[i+2]=30;a[i+3]=255;}
  return a;
};
function rect(im,x,y,w,h,c){
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    const p=(yy*W+xx)*4;
    im[p]=c[0];im[p+1]=c[1];im[p+2]=c[2];
  }
}
function fakeReaction(im,x,y,w=88,h=45,selected=false){
  const c=selected?[41,44,77]:[42,41,47];
  rect(im,x,y,w,h,c);
  // Simulate holes for emoji glyphs and count that should not disconnect fill.
  rect(im,x+15,y+11,12,17,[255,230,110]);
  rect(im,x+w-22,y+12,12,18,[230,231,235]);
}

test('adjacent emoji-count pills plus add-reaction chip form a masked row',()=>{
  const image=makeImage();
  fakeReaction(image,102,205,95,45,true);
  fakeReaction(image,208,205,90,45,true);
  fakeReaction(image,311,204,69,46,false);
  const hits=findReactionRows(image,W,H);
  assert.equal(hits.length,1);
  assert.equal(hits[0].count,3);
  assert.ok(hits[0].x>=100 && hits[0].x<=104);
  assert.ok(hits[0].y>=203 && hits[0].y<=206);
});

test('two reaction rows are identified independently',()=>{
  const image=makeImage();
  fakeReaction(image,103,45,91,45,true);fakeReaction(image,208,46,70,45);
  fakeReaction(image,103,320,91,45,true);fakeReaction(image,208,320,70,45);
  assert.equal(findReactionRows(image,W,H).length,2);
});

test('single emoji chip or inline emoji inside message must survive',()=>{
  const image=makeImage();
  fakeReaction(image,103,150,95,45,true);
  rect(image,103,40,12,20,[255,230,110]);
  assert.deepEqual(findReactionRows(image,W,H),[]);
});

test('unrelated distant buttons and mention badges must not be treated as reactions',()=>{
  const image=makeImage();
  fakeReaction(image,120,70,94,46,true);
  fakeReaction(image,260,180,91,46);
  assert.deepEqual(findReactionRows(image,W,H),[]);
});

test('white theme screenshot does not match dark Discord reaction chips',()=>{
  const image=makeImage();
  for(let i=0;i<image.length;i+=4){image[i]=250;image[i+1]=250;image[i+2]=252;}
  rect(image,110,200,120,47,[225,225,230]);
  rect(image,240,200,85,47,[225,225,230]);
  assert.deepEqual(findReactionRows(image,W,H),[]);
});

test('invalid and short bitmap inputs never mask content',()=>{
  assert.deepEqual(findReactionRows(new Uint8Array(10),600,500),[]);
  assert.deepEqual(findReactionRows(null,600,500),[]);
  assert.deepEqual(findReactionRows(makeImage(),150,480),[]);
});
