import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_QUEUE_IMAGES,moveQueueItem,runImageQueue,formatQueueTranscript} from '../image-queue.mjs';
const html=readFileSync(new URL('../batch.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../batch.js',import.meta.url),'utf8');
test('explicit order is immutable and bounds safe',()=>{
 const source=['A','B','C'];assert.deepEqual(moveQueueItem(source,1,-1),['B','A','C']);assert.deepEqual(source,['A','B','C']);assert.deepEqual(moveQueueItem(source,0,-1),source);
});
test('awaits each read; retains ordered results and duplicate text',async()=>{
 let active=0,peak=0;const order=[];
 const results=await runImageQueue(['B','A','C'],{read:async(file)=>{active++;peak=Math.max(peak,active);order.push(file);await new Promise(r=>setTimeout(r,1));active--;return {state:'done',text:'same'};}});
 assert.equal(peak,1);assert.deepEqual(order,['B','A','C']);assert.equal(formatQueueTranscript(results).match(/same/g).length,3);
});
test('failures isolated; partial results clearly labelled',async()=>{
 const results=await runImageQueue([1,2,3],{read:async(file)=>{if(file===2)throw Error('private');return {state:file===1?'partial':'done',text:'body'};}});
 assert.deepEqual(results.map(r=>r.state),['partial','failed','done']);assert.doesNotMatch(JSON.stringify(results),/private/);assert.match(formatQueueTranscript(results),/ผลบางส่วน/);
});
test('cancel stops before next image, preserves completed result',async()=>{
 let stop=false;const called=[];const results=await runImageQueue([1,2,3],{stopped:()=>stop,read:async(i)=>{called.push(i);if(i===2){stop=true;return {state:'cancelled',text:'unfinished'};}return {state:'done',text:'complete'};}});
 assert.deepEqual(called,[1,2]);assert.deepEqual(results.map(r=>r.state),['done','cancelled','pending']);assert.match(formatQueueTranscript(results),/complete/);assert.doesNotMatch(formatQueueTranscript(results),/unfinished/);
});
test('stop before first read and queue cap',async()=>{
 let called=0;const r=await runImageQueue([1,2],{stopped:()=>true,read:async()=>{called++;}});assert.equal(called,0);assert.equal(r[0].state,'pending');await assert.rejects(runImageQueue(Array(MAX_QUEUE_IMAGES+1),{read:async()=>{}}),RangeError);
});
test('browser integration uses original OCR and releases only image-local state',()=>{
 assert.match(html,/id="photo"[^>]*multiple/);assert.match(js,/await runImage\(file,true\).*finally\{releaseImageState\(\)/);assert.match(js,/if\(onnx\)return;/);assert.match(js,/if\(worker\)return worker;/);assert.match(js,/if\(!inQueue\)renderReview\(\)/);assert.match(js,/if\(!item.dom\)return;/);
 const release=js.slice(js.indexOf('function releaseImageState'),js.indexOf('function showQueueTranscript'));assert.doesNotMatch(release,/worker\s*=|onnx\s*=|terminate\(|\.release\(/);assert.match(release,/imagePixels=null/);assert.match(release,/items=\[\]/);assert.match(release,/imageCanvas=null/);
});

test('mock browser exercises queue UI with success, failure and reusable OCR resources',async()=>{
 const {runInNewContext}=await import('node:vm');
 const elements=new Map();
 class El{
  constructor(){this.children=[];this.listeners={};this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.files=[];}
  replaceChildren(...children){this.children=children;} append(...children){this.children.push(...children);} querySelectorAll(){return [];} setAttribute(){} addEventListener(name,fn){this.listeners[name]=fn;}
 }
 const get=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id);};
 const calls=[];
 const context={MAX_QUEUE_IMAGES,moveQueueItem,runImageQueue,formatQueueTranscript,document:{getElementById:get,createElement:()=>new El()},window:{addEventListener(){},confirm:()=>true},setTimeout,console,calls};
 const source=js.replace(/^import .*;$/gm,'');
 runInNewContext(source+`\nrunImage=async function(file,inQueue){
  if(imageCanvas||items.length||ocrLines.length)throw Error('stale image state');
  if(!worker)worker={};if(!onnx)onnx={};calls.push({file:file.name,worker,onnx,inQueue});
  imageCanvas={width:100,height:100};ocrLines=[{}];items=[{prepared:{canvas:{width:50,height:20}}}];
  return file.name==='bad'?{state:'failed',diagnostic:'safe failure'}:{state:'done',text:file.name,diagnostic:'safe result'};
 };`,context);
 get('photo').files=[{name:'B'},{name:'bad'},{name:'A'}];get('photo').listeners.change();
 assert.equal(get('queue-list').children.length,3);assert.equal(get('review').disabled,true);
 get('queue-list').children[2].children[1].listeners.click();
 await get('start').listeners.click();
 assert.deepEqual(calls.map(c=>c.file),['B','A','bad']);assert.ok(calls.every(c=>c.inQueue&&c.worker===calls[0].worker&&c.onnx===calls[0].onnx));
 assert.match(get('transcript-text').value,/ภาพ 1 ---\nB[\s\S]*ภาพ 2 ---\nA[\s\S]*อ่านภาพไม่สำเร็จ/);
 assert.equal(get('queue-progress').value,3);assert.equal(get('start').disabled,false);assert.equal(get('transcript-text').readOnly,false);
 get('photo').files=[{name:'one'}];get('photo').listeners.change();assert.equal(get('queue-panel').hidden,true);assert.equal(get('advanced-results').hidden,false);assert.equal(get('review').disabled,false);
});
