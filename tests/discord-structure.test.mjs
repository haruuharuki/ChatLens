import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOCRLines,parseSpeakerHeader,structureOCRLines,formatStructuredSegments,coloredHeaderHint} from '../lib/discord-structure.mjs';

const line=(text,y,x=55)=>({text,bbox:{x0:x,y0:y,x1:500,y1:y+23}});

test('Tesseract.js v6 nested blocks flatten into ordered lines',()=>{
 const blocks=[{paragraphs:[{lines:[line('Multiple 1:55 PM',80),line('สวัสดี',113)]}]}, {paragraphs:[{lines:[line('[Staff] เจี๊ย 1:56 PM',161)]}]}];
 assert.deepEqual(extractOCRLines(blocks).map(x=>x.text),['Multiple 1:55 PM','สวัสดี','[Staff] เจี๊ย 1:56 PM']);
 assert.deepEqual(extractOCRLines(null),[]);
});

test('parse plausible Discord speaker headers with timestamps',()=>{
 assert.deepEqual(parseSpeakerHeader('9 Multiple 1:55PM'),{speaker:'Multiple',time:'1:55 PM',date:null});
 assert.deepEqual(parseSpeakerHeader('[Staff] เจี๊ย 1:56 PM'),{speaker:'[Staff] เจี๊ย',time:'1:56 PM',date:null});
 assert.deepEqual(parseSpeakerHeader('2% [12] เอซาเรียน | เบส @DAV 1.53PM'),{speaker:'[12] เอซาเรียน | เบส @DAV',time:'1:53 PM',date:null});
 assert.equal(parseSpeakerHeader('วันนี้เรานัดกันตอนบ่ายนะ'),null);
 assert.equal(parseSpeakerHeader('4:32 PM'),null);
});

test('speaker/message/reply groups are coherent; unfamiliar unheaded content survives',()=>{
 const lines=[line('ข้อความที่ยังไม่รู้ผู้พูด',10),line('Multiple 1:55 PM',45),line('แม่งไม่ขมเลย',80),line('เฉลยว่าเพื่อนเป็นคนตอบ',110),line('@Multiple เคยพูดเรื่องนี้',150,81),line('[Staff] เจี๊ย 1:56 PM',180),line('จำได้แล้ว',210)];
 const r=structureOCRLines(lines);
 assert.equal(r.headers,2);
 assert.equal(r.unknown,1);
 assert.deepEqual(r.messages.map(x=>x.speaker),[null,'Multiple','[Staff] เจี๊ย']);
 assert.equal(r.messages[1].body,'แม่งไม่ขมเลย\nเฉลยว่าเพื่อนเป็นคนตอบ');
 assert.equal(r.messages[2].replyTo,'@Multiple เคยพูดเรื่องนี้');
 assert.equal(r.messages[2].body,'จำได้แล้ว');
});

test('do not mistake body times as Discord header when full sentence is long',()=>{
 const r=structureOCRLines([line('Multiple 1:55PM',30),line('เราเล่นเกมตอน 2:00 PM นะจะได้กลับบ้าน',65)]);
 assert.equal(r.headers,1);
 assert.match(r.messages[0].body,/2:00 PM/);
});

test('header color hint uses colored pixels; does not classify ordinary white text',()=>{
 const w=220,h=60,raw=new Uint8ClampedArray(w*h*4).fill(26);
 for(let i=3;i<raw.length;i+=4)raw[i]=255;
 const bbox={x0:10,y0:10,x1:170,y1:40};
 assert.equal(coloredHeaderHint(raw,w,h,bbox),false);
 for(let y=13;y<30;y++)for(let x=20;x<76;x++){
  const j=(y*w+x)*4;raw[j]=110;raw[j+1]=125;raw[j+2]=230;
 }
 assert.equal(coloredHeaderHint(raw,w,h,bbox),true);
});

test('structured output is copy-ready but raw remains fallback and no text is invented',()=>{
 const data=[
  {source:'IMG_010.png',text:'original OCR',structuredValid:true,messages:[{speaker:'Multiple',time:'1:55 PM',date:null,body:'สวัสดี',replyTo:null}]},
  {source:'IMG_011.png',text:'อ่านไม่ชัดครับ',structuredValid:false,messages:[]},
  {source:'IMG_012.png',text:'ภาพแนบ',structuredValid:true,hasMedia:true,messages:[{speaker:'[Staff] ก',time:'1:56 PM',date:null,body:'ขอบคุณ',replyTo:'@Multiple ทักมา'}]}
 ];
 const out=formatStructuredSegments(data);
 assert.match(out.text,/\[Multiple\] — 1:55 PM\nสวัสดี/);
 assert.match(out.text,/\[ไม่สามารถระบุผู้พูดจากภาพ IMG_011.png\]\nอ่านไม่ชัดครับ/);
 assert.match(out.text,/> ตอบกลับ: @Multiple ทักมา/);
 assert.match(out.text,/ภาพแนบในแชท/);
 assert.equal(out.structuredCount,2);
 assert.equal(out.unknownCount,1);
});

test('unknown prefix with time not erased',()=>{
 const r=structureOCRLines([line('ข้อความต่อเนื่องจากภาพก่อน',10),line('[Staff] ก 1:56 PM',60),line('รับทราบ',95)]);
 assert.equal(r.messages[0].body,'ข้อความต่อเนื่องจากภาพก่อน');
 assert.equal(r.messages[0].speaker,null);
 assert.equal(r.messages[1].speaker,'[Staff] ก');
});


test('colored but garbled header time creates UNKNOWN boundary instead of misattributing',()=>{
 const w=600,h=210,pixels=new Uint8ClampedArray(w*h*4);
 for(let j=0;j<pixels.length;j+=4){pixels[j]=26;pixels[j+1]=26;pixels[j+2]=30;pixels[j+3]=255;}
 // Synthetic colored header glyph ink on the row with lost time.
 for(let y=103;y<118;y++)for(let x=65;x<145;x++){const i=(y*w+x)*4; pixels[i]=35; pixels[i+1]=205; pixels[i+2]=90;}
 const r=structureOCRLines([line('Multiple 1:55PM',15),line('ข้อความเดิม',48),line('[04] | พง 2:หวน',100),line('เริ่มไม่ฟิน',140)],{pixels,width:w,height:h});
 assert.equal(r.messages.length,2);
 assert.equal(r.messages[0].speaker,'Multiple');
 assert.equal(r.messages[1].speaker,null);
 assert.match(r.messages[1].body,/เริ่มไม่ฟิน/);
});

// Synthetic reply layout inspired by a private screenshot; no private text assets.
test('wrapped Discord reply preview is emitted before its replying message header',()=>{
  const lines=[
    line('@Tester วันนี้จะช่วยกันทดลองสูตรอาหาร',30,102),
    line('ขั้นแรก • เตรียมอุปกรณ์...',57,57),
    line('[12] ผู้เล่นทดสอบ | Demo DAV 1:53 PM',94,58),
    line('รับทราบ เดี๋ยวเตรียมของก่อน',125,58),
    line('Tester 1:55 PM',182,58),
    line('โอเค ขอบคุณนะ',216,58)
  ];
  const r=structureOCRLines(lines);
  assert.equal(r.headers,2);
  assert.equal(r.unknown,0);
  assert.deepEqual(r.messages.map(m=>m.speaker),['[12] ผู้เล่นทดสอบ | Demo DAV','Tester']);
  assert.equal(r.messages[0].reply?.author,'Tester');
  assert.equal(r.messages[0].reply?.excerpt,'วันนี้จะช่วยกันทดลองสูตรอาหาร ขั้นแรก • เตรียมอุปกรณ์...');
  assert.equal(r.messages[0].body,'รับทราบ เดี๋ยวเตรียมของก่อน');
  const text=formatStructuredSegments([{structuredValid:true,messages:r.messages}]).text;
  assert.match(text,/> ตอบกลับ: \[Tester\] — วันนี้จะช่วยกันทดลองสูตรอาหาร ขั้นแรก/);
  assert.ok(text.indexOf('> ตอบกลับ:') < text.indexOf('[[12] ผู้เล่นทดสอบ'));
  assert.equal((text.match(/ขั้นแรก/g)||[]).length,1);
});

test('ordinary @mention in body is not treated as a Discord reply preview',()=>{
  const r=structureOCRLines([
    line('Tester 1:52 PM',10,55),
    line('ขอพูดหน่อย',46,55),
    line('@Tester ทักมานะ',82,55),
    line('[Staff] เจี๊ย 1:53 PM',116,55),
    line('ได้จ้า',150,55)
  ]);
  assert.equal(r.messages.length,2);
  assert.equal(r.messages[0].body,'ขอพูดหน่อย\n@Tester ทักมานะ');
  assert.equal(r.messages[1].replyTo,null);
});

test('reply preview without a following author header stays visible and unassigned',()=>{
  const r=structureOCRLines([line('@Tester อ้างอิงข้อความ',15,86),line('บรรทัดต่อไป',49,55)]);
  assert.equal(r.messages.length,1);
  assert.equal(r.messages[0].speaker,null);
  assert.equal(r.messages[0].body,'@Tester อ้างอิงข้อความ\nบรรทัดต่อไป');
});

test('complex or unreadable reply handle keeps original quote without inventing user',()=>{
  const r=structureOCRLines([
    line('@[04] ชื่อไม่แน่ชัด กำลังคุยอยู่',12,91),
    line('[Staff] ก 1:54 PM',50,56),
    line('ตอบแล้ว',85,56)
  ]);
  assert.equal(r.messages.length,1);
  assert.equal(r.messages[0].reply.author,null);
  const formatted=formatStructuredSegments([{structuredValid:true,messages:r.messages}]).text;
  assert.match(formatted,/> ตอบกลับ: @\[04\] ชื่อไม่แน่ชัด กำลังคุยอยู่/);
});

test('too distant quoted line is retained instead of falsely linked',()=>{
  const r=structureOCRLines([
    line('@Tester คุยเรื่องอื่น',20,100),
    line('[Staff] ก 1:54 PM',250,60),
    line('ตอบจ้า',285,60)
  ]);
  assert.equal(r.messages.length,2);
  assert.equal(r.messages[0].speaker,null);
  assert.equal(r.messages[1].replyTo,null);
});
