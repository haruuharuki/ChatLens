import test from 'node:test';
import assert from 'node:assert/strict';
import {inkValue,isDarkScreenshot,prepareDarkChatForOCR} from '../lib/ocr-preprocess.mjs';

test('dark UI becomes white page, bright Thai/green headers become dark ink',()=>{
  assert.ok(inkValue(26,26,30)>245);
  assert.ok(inkValue(235,235,235)<10);
  assert.ok(inkValue(40,185,100)<125);
});

test('dark detection uses right margin without depending on image contents',()=>{
  const w=10,h=10;
  const dark=new Uint8ClampedArray(w*h*4);
  const light=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<dark.length;i+=4){dark[i]=dark[i+1]=dark[i+2]=26;dark[i+3]=255;light[i]=light[i+1]=light[i+2]=250;light[i+3]=255;}
  assert.equal(isDarkScreenshot(dark,w,h),true);
  assert.equal(isDarkScreenshot(light,w,h),false);
});

test('preserves bright screenshot and only changes isolated OCR canvas',()=>{
  const width=10,height=10;
  let backing=new Uint8ClampedArray(width*height*4).fill(250);
  const source=backing.slice();
  const ctx={getImageData:()=>({data:backing.slice()}),putImageData:(img)=>{backing=img.data;}};
  const canvas={width,height,getContext:()=>ctx};
  assert.equal(prepareDarkChatForOCR(canvas),false);
  assert.deepEqual(backing,source);
});
