import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationCrop,bulletRegion,replyTextLeft,refineSemanticRows,headerBandBlocked,headerClockAligned,hasMentionBackground,timedAuthorEvidence} from '../d4-layout.mjs';
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

// Synthetic fixtures only. Role color is not a classification label.
test('D5bc tinted roles of different hues stay under the same timed speaker, even if OCR mislabels them',()=>{
 const p=picture(),colors=[[26,42,43],[26,37,35],[46,26,37],[45,45,85]],rows=[head];
 for(let i=0;i<colors.length;i++){
  const y=150+i*45,b=box(65,y,280,y+35);paint(p,box(65,y+3,230,y+32),colors[i]);paint(p,box(80,y+10,190,y+17),[30,185,130]);
  rows.push(row(i%2?'header':'reply',b,'@Role '+i));assert.equal(hasMentionBackground(b,p,W,H,col),true);
 }
 const end=row('body',box(65,330,300,365),'question');rows.push(end);
 const out=refineSemanticRows(rows,p,W,H,col);assert.ok(out.slice(1,5).every(r=>r.kind==='body'&&r.mention));
 assert.equal(assembleTextTranscript(out).entries[0].body,'@Role 0\n@Role 1\n@Role 2\n@Role 3\nquestion');
 // Colored glyphs on plain chat background are not a highlighted mention.
 const q=picture();paint(q,box(70,150,200,160),[30,200,100]);assert.equal(hasMentionBackground(box(65,145,310,185),q,W,H,col),false);
});
test('D5bc timed author initially tagged reply is recoverable, indented quote with clock is not',()=>{
 const p=picture(),a=row('reply',box(0,150,420,190),'Avatar [staff] Sample 11/26/26, 3:33 PM'),b=row('reply',box(65,240,420,280),'@Sample 3:33 PM');
 paint(p,box(10,151,46,188),[160,130,90]);paint(p,box(65,154,190,180),[90,120,245]);paint(p,box(250,160,390,177),[155,155,160]);
 paint(p,box(65,245,90,275),[160,130,90]);paint(p,box(110,245,210,270),[90,120,245]);paint(p,box(250,250,390,270),[155,155,160]);
 assert.equal(timedAuthorEvidence(a,p,W,H,col),true);assert.equal(timedAuthorEvidence(b,p,W,H,col),false);
 const r=refineSemanticRows([a,b],p,W,H,col);assert.equal(r[0].kind,'header');assert.equal(r[1].kind,'reply');assert.equal(headerBandBlocked(a.bbox,[a],p,W,H,col),false);
});
test('D5bc cropped thin edge rows remain reviewable while complete short messages survive',()=>{
 const p=picture(),rows=[row('body',box(65,0,200,12),'noise'),row('body',box(65,30,200,72),'first'),head,row('body',box(65,180,200,222),'second'),row('body',box(65,875,200,900),'last')];
 let r=refineSemanticRows(rows,p,W,H,col,{cropped:true});assert.equal(r[0].kind,'covered');assert.equal(r[1].kind,'body');assert.equal(r[4].kind,'body');
 r=refineSemanticRows(rows,p,W,H,col);assert.equal(r[0].kind,'body');
});
test('D5bc compact reaction can contain multicolor emoji without becoming chat',()=>{
 const p=picture(),b=box(75,150,190,195);paint(p,b,[41,41,46]);paint(p,box(80,157,109,188),[235,180,50]);paint(p,box(116,165,124,180),[155,155,160]);
 const r=refineSemanticRows([head,row('fragment',b,'noise')],p,W,H,col);assert.equal(r[1].kind,'graphic');
});
test('D5bc partial fragment under a mention merges only shallow overlapping marks into full crop',()=>{
 const p=picture(),a=row('fragment',box(0,145,190,170),'noise'),b=row('reply',box(65,150,280,195),'@Role hello');
 paint(p,box(65,151,235,191),[26,42,43]);paint(p,box(80,155,175,165),[26,188,156]);paint(p,box(80,147,90,153),[26,188,156]);
 const r=refineSemanticRows([head,a,b,row('body',box(65,220,240,265),'body')],p,W,H,col);assert.equal(r[1].kind,'covered');assert.equal(r[2].kind,'body');assert.equal(r[2].bbox.y0,145);
});
test('D5bc nested split sliver is not a second line even when both candidates are recovery rows',()=>{
 const p=picture(),a=row('body',box(0,150,270,166),'noise',{splitBody:true}),b=row('body',box(0,150,270,200),'full',{splitBody:true});paint(p,box(70,151,230,195));
 const r=refineSemanticRows([head,a,b,row('body',box(65,230,240,275),'next')],p,W,H,col);assert.equal(r[1].kind,'covered');assert.equal(r[2].kind,'body');
});
