import test from 'node:test';
import assert from 'node:assert/strict';
import {thaiMarkDominates,selectBilingualText} from '../region-output.mjs';
import {resolveNameEvidence} from '../name-evidence.mjs';
import {edgeTextTop,refineEdgeRows} from '../d5d-layout.mjs';
import {assembleTextTranscript} from '../text-transcript.mjs';
const box=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
const W=500,H=600,col={x:65,samples:8};
function picture(){const p=new Uint8ClampedArray(W*H*4);for(let i=0;i<p.length;i+=4)p.set([26,26,30,255],i);return p;}
function paint(p,b,c=[230,230,230]){for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)p.set([...c,255],(y*W+x)*4);}
test('Thai marks are restored only from complete observed same-base spellings',()=>{
 assert.equal(thaiMarkDominates('กินบ่ลง','กินบลง'),true);
 assert.equal(selectBilingualText('กินบลง','กินบลง','กินบ่ลง'),'กินบ่ลง');
 assert.equal(selectBilingualText('วันนี้','วันนี','วันนี'),'วันนี้');
 assert.equal(selectBilingualText('ก่า','ก้า','กา'),'ก่า');
 assert.equal(selectBilingualText('คำแรก','คำอื่น','คำอื่น'),'คำแรก');
 assert.equal(selectBilingualText('ก้า!','ก่า','ก่า'),'ก้า!');
});
test('short fragment fallback is bounded and does not override marks',()=>{
 assert.equal(selectBilingualText('ดาดาว','ตาดาว','ตาดาว',{shortFragment:true}),'ตาดาว');
 assert.equal(selectBilingualText('ดาดาว','ตาดาว','ตาดาว'),'ดาดาว');
 assert.equal(selectBilingualText('ได้ชิ้น','ได้ชิน','ได้ชิน',{shortFragment:true}),'ได้ชิ้น');
 assert.equal(selectBilingualText('ข้อความยาว','ข้อความเก่า','ข้อความเก่า',{shortFragment:true}),'ข้อความยาว');
});
function head(y,t,name,base,native,scaled,full=name,badge=false){return {kind:'header',layoutHeader:true,bbox:box(65,y,400,y+36),nameROI:box(65,y,170,y+36),text:name+' '+t,baseline:base+' '+t,nameEvidence:{full:full+' '+t,nearby:full+' '+t,native,scaled,badge}};}
function names(p,ys){for(const y of ys)for(let x=70;x<160;x+=10)paint(p,box(x,y+5,x+4,y+28),[46,204,113]);}
test('identical pixels and repeated full/native observation settle inconsistent Thai names',()=>{
 const p=picture();names(p,[50,150]);const a=head(50,'9:30 PM','(08) ชื่อกุ้ง','(08) ชื่อกุ้ง','(08) ชื่อกุ้ง','(08) ชื่อกั้ง'),b=head(150,'9:31 PM','(08) ชื่อกั้ง','(08) ชื่อกั้ง','(08) ชื่อกุ้ง','(08) ชื่อกั้ง','(08) ชื่อกุ้ง');
 const r=resolveNameEvidence([a,b],p,W,H);assert.ok(r.every(q=>q.nameResolution.speaker==='(08) ชื่อกุ้ง'));assert.equal(r[1].nameResolution.time,'9:31 PM');
});
test('badge suffix does not prevent recovery of observed Thai mark in name',()=>{
 const p=picture();names(p,[50,150]);const a=head(50,'9:30 PM','10 | ตน','10 | ตุน TAG','10 | ตน','10 | ตน','10 | ตน TAG',true),b=head(150,'9:31 PM','10 | ตน','10 | ตุน TAG','10 | ตน','10 | ตน','10 | ตน TAG',true);
 const r=resolveNameEvidence([a,b],p,W,H);assert.ok(r.every(q=>q.nameResolution.speaker==='10 | ตุน'));assert.ok(r.every(q=>q.nameResolution.uncertain));
});
test('different pixel shapes and contradictory prefixes do not pool names',()=>{
 const p=picture();names(p,[50,150]);paint(p,box(73,155,76,160),[46,204,113]);const a=head(50,'9:30 PM','(08) กุ้ง','(08) กุ้ง','(08) กุ้ง','(08) กั้ง'),b=head(150,'9:31 PM','(09) กั้ง','(09) กั้ง','(09) กั้ง','(09) กั้ง');const r=resolveNameEvidence([a,b],p,W,H);assert.notEqual(r[0].nameResolution.speaker,r[1].nameResolution.speaker);
});
test('remove clipped colored strip only, keep complete white body and real top marks',()=>{
 const p=picture(),b=box(65,0,280,48);paint(p,box(80,0,86,7),[46,204,113]);paint(p,box(70,10,250,35));assert.equal(edgeTextTop(b,p,W,H,col,32),7);
 paint(p,box(75,1,83,4));assert.equal(edgeTextTop(b,p,W,H,col,32),null);
});
test('edge fragment cleanup cannot delete the complete visible body, manual truth wins',()=>{
 const r={kind:'body',bbox:box(65,0,280,48),text:'ข้อความ',baseline:'ข้อความ',candidate:'ี ข้อความ',edgeTextTop:7};assert.equal(assembleTextTranscript([r]).entries[0].body,'ข้อความ');assert.equal(assembleTextTranscript([{...r,truth:'ข้อความจริง'}]).entries[0].body,'ข้อความจริง');
});
test('trailing hyphen is preserved only with corroborating exact content',()=>{
 assert.equal(selectBilingualText('ไปมั้','ไปมั้-','ไปมั้-'),'ไปมั้-');assert.equal(selectBilingualText('ไปมั้','ไปมั้-','ไปมั้'),'ไปมั้');
});
