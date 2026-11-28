import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationCrop,bulletRegion,replyTextLeft,refineSemanticRows,headerBandBlocked,headerClockAligned} from '../d4-layout.mjs';
import {splitBoxesAtHeaders} from '../header-layout.mjs';
import {redundantSplit} from '../region-plan.mjs';
import {assembleTextTranscript} from '../text-transcript.mjs';
import {resolveNameEvidence} from '../name-evidence.mjs';
const W=500,H=900,col={x:65,samples:8};
const box=(x0,y0,x1,y1)=>({x0,y0,x1,y1});
function picture(){const p=new Uint8ClampedArray(W*H*4);for(let i=0;i<p.length;i+=4)p.set([26,26,30,255],i);return p;}
function paint(p,b,c=[230,230,230]){for(let y=b.y0;y<b.y1;y++)for(let x=b.x0;x<b.x1;x++)p.set([...c,255],(y*W+x)*4);}
const row=(kind,bbox,text,more={})=>({kind,bbox,text,...more});
const head=row('header',box(65,100,400,135),'Sample 9:30 PM');
test('D4a requires paired edge evidence; cropped and ambiguous screenshots stay intact',()=>{
 const p=picture();paint(p,box(0,120,W,122),[41,41,45]);assert.equal(conversationCrop(p,W,H).cropped,false);
 paint(p,box(25,800,475,850),[36,36,41]);assert.deepEqual(conversationCrop(p,W,H),{x:30,y:122,width:470,height:678,cropped:true});
 assert.equal(conversationCrop(picture(),W,H).cropped,false);
});
test('D4b incomplete overlapping split becomes diagnostic only; separate text remains',()=>{
 const p=picture();const a=row('body',box(65,150,240,185),'ตัวอย่าง'),b=row('body',box(0,152,248,173),'garbage',{splitBody:true});
 paint(p,box(70,155,200,165));const c=row('body',box(65,200,180,235),'อีกข้อความ');
 let result=refineSemanticRows([head,a,b,c],p,W,H,col);assert.equal(result[2].kind,'covered');assert.equal(result[3].kind,'body');
 paint(p,box(246,156,248,160));result=refineSemanticRows([head,a,b,c],p,W,H,col); // still within the 8px safety margin
 assert.equal(result[2].kind,'covered');
 const wide={...b,bbox:box(0,152,280,173)};paint(p,box(265,156,270,161));assert.equal(refineSemanticRows([head,a,wide,c],p,W,H,col)[2].kind,'body');
});
test('D4c colored mention is body, compact raised reaction is graphic, ordinary reply retained',()=>{
 const p=picture();const a=row('reply',box(65,145,310,180),'@Sample hello'),b=row('reply',box(120,210,190,245),'2 @'),c=row('reply',box(65,280,360,315),'@Another quote');
 paint(p,box(65,150,190,178),[52,52,82]);paint(p,b.bbox,[41,41,46]);
 const r=refineSemanticRows([head,a,b,c],p,W,H,col);assert.equal(r[1].kind,'body');assert.equal(r[1].mention,true);assert.equal(r[2].kind,'graphic');assert.equal(r[3].kind,'reply');
 assert.match(assembleTextTranscript([head,{...r[1],candidate:'hello',baseline:'hello',originalText:a.text}]).entries[0].body,/@Sample hello/);
});
test('D4c remove dense preview avatar only with confirmed gap and following ink',()=>{
 const p=picture(),b=box(65,145,310,185);paint(p,box(65,150,95,180),[180,130,90]);paint(p,box(105,155,120,175),[30,200,100]);assert.equal(replyTextLeft(b,p,W,H,col),103);assert.equal(replyTextLeft(b,picture(),W,H,col),null);
});
test('D4d bullet from visible dot; Thai numeral is not automatically a bullet',()=>{
 const p=picture(),b=box(65,145,230,185);paint(p,box(67,161,76,170));paint(p,box(96,151,110,178));assert.ok(bulletRegion(b,p,W,H,col));
 const r=refineSemanticRows([head,row('body',b,'๑ sample')],p,W,H,col)[1];assert.equal(r.bullet,true);
 assert.equal(assembleTextTranscript([head,{...r,bulletRead:true,candidate:'sample',baseline:'sample'}]).entries[0].body,'- sample');
 assert.equal(assembleTextTranscript([head,{...r,truth:'manual'}]).entries[0].body,'manual');
 const q=picture();paint(q,box(67,151,76,179));paint(q,box(96,151,110,178));assert.equal(bulletRegion(b,q,W,H,col),null);
});
test('D4d paragraph markers remain internal and preserve empty lines',()=>{
 const p=picture(),a=row('body',box(65,150,240,185),'first'),b=row('body',box(65,230,240,265),'second');const r=refineSemanticRows([head,a,b],p,W,H,col);assert.equal(r[2].paragraphBefore,true);assert.equal(assembleTextTranscript(r).entries[0].body,'first\n\nsecond');
});
test('D4e same isolated name beats noisy wider crop without deleting numeric structured prefix',()=>{
 const p=picture();const r={...head,text:'junk Sample 9:30 PM',baseline:'junk Sample 9:30 PM',nameROI:box(65,100,150,135),nameEvidence:{full:'junk Sample 9:30 PM',nearby:'junk Sample 9:30 PM',native:'Sample',scaled:'Sample',badge:false}};
 assert.equal(resolveNameEvidence([r],p,W,H)[0].nameResolution.speaker,'Sample');
 const q={...r,text:'[01] Sample 9:30 PM',baseline:'[01] Sample 9:30 PM',nameEvidence:{...r.nameEvidence,full:'[01] Sample 9:30 PM',nearby:'[01] Sample 9:30 PM'}};
 assert.equal(resolveNameEvidence([q],p,W,H)[0].nameResolution.speaker,'[01] Sample');
});

test('D5a highlighted mention incorrectly labelled header stays in current message',()=>{
 const p=picture(),b=box(65,145,310,180);paint(p,box(65,150,190,178),[41,44,81]);
 const r=refineSemanticRows([head,row('header',b,'noise @Other hello',{layoutHeader:true})],p,W,H,col);
 assert.equal(r[1].kind,'body');assert.equal(r[1].layoutHeader,false);assert.equal(r[1].mention,true);
 const out=assembleTextTranscript([head,{...r[1],baseline:'hello',candidate:'hello'}]);
 assert.equal(out.entries[0].speaker,'Sample');assert.equal(out.entries[0].body,'@Other hello');assert.equal(out.entries.length,1);
});
test('D5a taller overlapping short fragment retains unique ink; clipped recovery stays reviewable',()=>{
 const p=picture(),a=row('body',box(0,145,120,185),'noise',{splitBody:true}),b=row('fragment',box(0,160,115,206),'ถาม');
 paint(p,box(69,176,100,200));let r=refineSemanticRows([head,a,b],p,W,H,col);
 assert.equal(r[1].kind,'covered');assert.equal(r[2].kind,'fragment');
 paint(p,box(70,148,84,154));r=refineSemanticRows([head,a,b],p,W,H,col);assert.equal(r[1].kind,'body');
});

// Geometry scaled to a synthetic viewport: one OCR container includes the
// clock and part of a separately observed highlighted message underneath.
test('D5a1 mixed container keeps author clock; full mention appears once under its author',()=>{
 const p=picture(),header=box(65,100,480,135),mention=box(65,145,310,180);
 paint(p,box(68,150,195,177),[41,44,81]);paint(p,box(80,158,175,165),[190,195,250]);paint(p,box(200,155,300,170));
 const wide=row('mixed',box(0,90,200,178),'Sample 9:30 PM'),full=row('reply',mention,'@Other hello');
 const before=refineSemanticRows([wide,full],p,W,H,col);
 assert.equal(before[0].kind,'mixed');assert.equal(before[1].mention,true);
 assert.equal(headerBandBlocked(header,before,p,W,H,col),false);
 assert.equal(headerBandBlocked(mention,before,p,W,H,col),true);
 assert.equal(headerClockAligned(header,wide),true);assert.equal(headerClockAligned(mention,wide),false);
 const separated=splitBoxesAtHeaders(before,[header],W).lines;
 const recovery=separated.find(x=>x.needsBodyRead),primary=redundantSplit(recovery,separated,p,W,H,col);
 assert.equal(primary?.mention,true);
 const result=assembleTextTranscript([row('header',header,'Sample 9:30 PM'),...separated.map(x=>x===recovery?{...x,kind:'covered'}:x)]);
 assert.equal(result.entries.length,1);assert.equal(result.entries[0].speaker,'Sample');assert.equal(result.entries[0].body,'@Other hello');
});
test('D5a1 a standalone highlighted mention containing clock text is not a header',()=>{
 const p=picture(),b=box(65,145,310,180);paint(p,box(65,150,190,178),[41,44,81]);
 const r=refineSemanticRows([head,row('header',b,'@Other 9:30 PM')],p,W,H,col);
 assert.equal(r[1].kind,'body');assert.equal(r[1].mention,true);assert.equal(headerBandBlocked(b,r,p,W,H,col),true);
});
test('D5a1 distinct mentions and a recovery without a complete replacement are not suppressed',()=>{
 const p=picture(),a=box(65,145,310,180),b=box(65,210,310,245);paint(p,box(65,150,190,178),[41,44,81]);paint(p,box(65,215,190,243),[41,44,81]);
 const r=refineSemanticRows([head,row('body',a,'@Other hello',{splitBody:true}),row('body',b,'@Other hello')],p,W,H,col);
 assert.equal(r[1].kind,'body');assert.equal(r[2].kind,'body');
 assert.equal(assembleTextTranscript(r).entries[0].body,'@Other hello\n@Other hello');
});
