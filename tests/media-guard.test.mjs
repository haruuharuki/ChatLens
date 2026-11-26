import test from 'node:test';
import assert from 'node:assert/strict';
import {detectBottomPhoto} from '../lib/media-guard.mjs';

function fake(width,height,photo=false){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  const isWhitePhoto=photo && y>height*.54 && x>=0 && x<width*.81;
  const isRedPhoto=photo && y>height*.80 && x>=0 && x<width*.81;
  const v=isWhitePhoto? (isRedPhoto? [155,45,55]:[245,245,245]):[26,26,30];
  data.set([v[0],v[1],v[2],255],i);
 }
 return {data};
}
test('a large bottom-anchored photo is marked rather than fed to OCR',()=>{
 const r=detectBottomPhoto(fake(450,900,true),450,900);
 assert.ok(r);assert.ok(r.y>400);assert.ok(r.height>300);
});
test('normal chat and a bright single text line are never masked',()=>{
 const x=fake(450,900,false);
 assert.equal(detectBottomPhoto(x,450,900),null);
 for(let y=400;y<440;y++)for(let col=0;col<340;col++){let i=(y*450+col)*4;x.data.set([245,245,245,255],i);}
 assert.equal(detectBottomPhoto(x,450,900),null);
});
