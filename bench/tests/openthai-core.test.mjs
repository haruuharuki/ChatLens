import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionSize,recognitionTensorFromRGBA,parseDictionary,greedyCTC,usableLineBox,OPEN_THAI_REVISION} from '../openthai-core.mjs';

test('model revision is pinned to 2.1.4 and size is multiple of 32',()=>{
 assert.equal(OPEN_THAI_REVISION,'v2.1.4');
 const s=recognitionSize(960,55);assert.equal(s.height,48);assert.equal(s.width%32,0);assert.ok(s.drawWidth<=s.width);
});
test('line candidate requires valid in-frame Tesseract box',()=>{
 assert.deepEqual(usableLineBox({bbox:{x0:10,y0:20,x1:120,y1:50}},320,320),{x0:10,y0:20,x1:120,y1:50});
 assert.equal(usableLineBox({bbox:{x0:10,y0:10,x1:15,y1:25}},320,320),null);
 assert.equal(usableLineBox({bbox:{x0:10,y0:10,x1:330,y1:30}},320,320),null);
});
test('RGBA tensor flips colors and stores channel-first data with padded zeros',()=>{
 const r=new Uint8ClampedArray(2*48*4);
 for(let i=0;i<r.length;i+=4){r[i]=255;r[i+1]=0;r[i+2]=0;r[i+3]=255;}
 const {data,dims}=recognitionTensorFromRGBA(r,2,48,1,{invert:false,channelOrder:'bgr'});
 assert.deepEqual(dims,[1,3,48,2]);
 assert.equal(data[0],-1); // B
 assert.equal(data[2*48],-1); // G
 assert.equal(data[2*2*48],1); // R
 assert.equal(data[1],0); // normalized padding
 const inv=recognitionTensorFromRGBA(r,2,48,1,{invert:true,channelOrder:'bgr'});
 assert.equal(inv.data[0],1);
});
test('dictionary loader keeps meaningful space and strips terminal blank',()=>{
 assert.deepEqual(parseDictionary('ก\nข\n \n'),['ก','ข',' ']);
});
test('greedy CTC collapses adjacent repetitions and blanks, NTC layout',()=>{
 const d=['ก','ข'];
 const seq=[1,1,0,2,2,0,1];
 const probs=Float32Array.from(seq.flatMap(i=>[0,1,2].map(j=>i===j?0.99:0.005)));
 assert.equal(greedyCTC(probs,[1,7,3],d).text,'กขก');
});
test('greedy CTC supports NCT layout and optional implicit space',()=>{
 const d=['ก','ข'];const steps=5,cls=4;
 const probs=new Float32Array(steps*cls).fill(-1);
 for(let t=0;t<steps;t++)probs[[1,3,3,0,0][t]*steps+t]=1;
 assert.equal(greedyCTC(probs,[1,cls,steps],d).text,'ก ');
});
test('CTC rejects mismatched classes and invalid data safely',()=>{
 assert.throws(()=>greedyCTC(new Float32Array(35),[1,7,5],['ก']),/classes/);
 assert.throws(()=>recognitionTensorFromRGBA(new Uint8Array(3),1,48,1),/bitmap/);
});
