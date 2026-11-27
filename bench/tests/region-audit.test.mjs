import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDetectedRegion,extendTextRight} from '../region-audit.mjs';
function bitmap(w,h,fn=()=>[26,26,26]){
 const a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set([...fn(x,y),255],(y*w+x)*4);
 return a;
}
const line=(kind,text,x0,y0,x1,y1)=>({kind,text,bbox:{x0,y0,x1,y1}});
test('photo-only box is REVIEWABLE graphic, not speech to OCR by default',()=>{
 const w=280,h=220,p=bitmap(w,h,(x,y)=>x>16&&x<145&&y>17&&y<160?(x%4<2?[178,83,66]:[127,108,80]):[26,26,26]);
 const r=auditDetectedRegion(line('fragment','a',17,18,144,158),p,w,h,{typicalHeight:27});
 assert.equal(r.kind,'graphic');
});
test('a short real white Thai utterance is not misidentified as a picture',()=>{
 const w=280,h=80,p=bitmap(w,h,(x,y)=>x>25&&x<195&&x%12<6&&y>20&&y<49?[238,238,238]:[26,26,26]);
 const r=auditDetectedRegion(line('fragment','เห้ย',24,17,205,53),p,w,h,{typicalHeight:34});
 assert.notEqual(r.kind,'graphic');
});
test('tall box with colored header row + separate white body row becomes mixed',()=>{
 const w=450,h=126,p=bitmap(w,h,(x,y)=>y>=8&&y<24&&x>=25&&x<275?[40,201,76]:y>=70&&y<89&&x>=35&&x<385?[230,230,230]:[26,26,26]);
 const r=auditDetectedRegion(line('header','Multiple 9:31 AM มีใครดูมาก่อน',22,5,395,94),p,w,h,{typicalHeight:31});
 assert.equal(r.kind,'mixed');assert.ok(r.bodyBand.top>50);assert.ok(r.bodyBand.bottom>=84);
});
test('single header with timestamp is preserved as a header',()=>{
 const w=300,h=55,p=bitmap(w,h,(x,y)=>x>=15&&x<225&&y>=12&&y<31?[72,180,240]:[26,26,26]);
 const r=auditDetectedRegion(line('header','Multiple 9:31 AM',13,10,229,34),p,w,h,{typicalHeight:27});
 assert.equal(r.kind,'header');
});
test('text ink continuing beyond right edge can extend bounded crop',()=>{
 const w=400,h=65,p=bitmap(w,h,(x,y)=>y>15&&y<44&&((x>70&&x<175)||(x>184&&x<288))&&x%12<7?[235,235,235]:[26,26,26]);
 const end=extendTextRight(p,w,h,{x0:65,y0:12,x1:175,y1:47});
 assert.ok(end>=270&&end<=305,end);
});
test('blank area and unrelated text far away never trigger right expansion',()=>{
 const w=400,h=65,p=bitmap(w,h,(x,y)=>x>290&&y>15&&y<44?[230,230,230]:[26,26,26]);
 const end=extendTextRight(p,w,h,{x0:65,y0:12,x1:175,y1:47});
 assert.equal(end,null);
});
test('clipped avatar sliver with accidental tiny OCR is not a chat utterance',()=>{
 const w=310,h=95;
 const p=bitmap(w,h,(x,y)=>x<43&&y>14&&y<67?(x%3===0?[192,91,66]:[87,155,194]):[26,26,26]);
 const r=auditDetectedRegion(line('fragment','p a',0,14,43,68),p,w,h,{typicalHeight:27});
 assert.equal(r.kind,'graphic');
});
