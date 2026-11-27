import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDiscordLine,coloredNameFraction,cleanBodyLineRGBA} from '../line-guard.mjs';
const c=(s,coloredFraction=0)=>classifyDiscordLine({text:s},{coloredFraction}).kind;
test('do not benchmark reply previews, including garbled leading punctuation',()=>{
 assert.equal(c('@Tester ข้อความอ้างอิง'), 'reply');
 assert.equal(c('“@ @[01] ผู้เล่นต้นทาง คำถามล่าสุด'), 'reply');
 assert.equal(c('2 @someone ตอบกลับ'), 'reply');
});
test('do not benchmark headers, roles or tiny colored fragments as body text',()=>{
 assert.equal(c('[04] ชื่อผู้เล่น 11:20 AM'), 'header');
 assert.equal(c('[01] ชื่อผู้เล่น TTO',.6), 'header');
 assert.equal(c('พ a',.8),'fragment');
 assert.equal(c('7ข้อความทดสอบกรณีอีโมจิ @',.05),'body');
});
test('keep ordinary mentions in message body when not at beginning',()=>{
 assert.equal(c('ฉันอยากตอบ @Someone ด้วยนะ'), 'body');
 assert.equal(c('ข้อความอันนี้มีสีจากอีโมจิทางขวา',.1),'body');
});
test('colored name signal focuses on first part and ignores emoji at right',()=>{
 const width=90,height=20,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,green=x<34,emoji=x>70;
  data.set(green?[30,211,80,255]:emoji?[240,170,40,255]:[215,215,215,255],i);
 }
 assert.ok(coloredNameFraction(data,width,height,{x0:0,y0:0,x1:90,y1:20})>.4);
 for(let y=0;y<height;y++)for(let x=0;x<34;x++){const i=(y*width+x)*4;data.set([220,220,220,255],i);}
 assert.equal(coloredNameFraction(data,width,height,{x0:0,y0:0,x1:90,y1:20}),0);
});
test('clean bitmap masks colored emoji but preserves neutral white text',()=>{
 const width=80,height=20,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;data.set(x<42?[226,226,226,255]:[255,194,44,255],i);
 }
 const result=cleanBodyLineRGBA(data,width,height);
 assert.equal(result.pixels[4*10],226);
 assert.equal(result.pixels[4*65],26);
 assert.equal(data[4*65],255);
 assert.ok(result.removedColor>0);
});
test('avatar guard only masks far left, and is opt-out',()=>{
 const data=new Uint8ClampedArray(60*15*4).fill(200);
 const a=cleanBodyLineRGBA(data,60,15,{absoluteX:0,canvasWidth:1500});
 assert.equal(a.pixels[0],26);
 assert.equal(a.pixels[4*28],200);
 const b=cleanBodyLineRGBA(data,60,15,{absoluteX:0,canvasWidth:1500,enableAvatarGuard:false});
 assert.equal(b.pixels[0],200);
});
test('when no color or avatar guard, pixels remain untouched',()=>{
 const data=new Uint8ClampedArray(15*12*4).fill(214);
 const a=cleanBodyLineRGBA(data,15,12);
 assert.deepEqual(a.pixels,data);assert.equal(a.band,null);
});
test('tall mixed row selects white message band rather than colored header',()=>{
 const width=140,height=85,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  const coloredHeader=y>=5&&y<18&&x<95;
  const bodyText=y>=52&&y<66&&x>=8&&x<130;
  data.set(coloredHeader?[36,204,84,255]:bodyText?[232,232,232,255]:[26,26,26,255],i);
 }
 const v=cleanBodyLineRGBA(data,width,height);
 assert.ok(v.band);assert.ok(v.band.top<=52);assert.ok(v.band.bottom>=66);
 assert.ok(v.band.top>=47);assert.ok(v.band.bottom<=70);
});
