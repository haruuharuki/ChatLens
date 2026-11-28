import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDiscordTimestamp,dateFromOCR,dateSeparator} from '../discord-timestamp.mjs';
import {classifyDiscordLine} from '../line-guard.mjs';
import {assembleTextTranscript,formatTextTranscript,parseHeader} from '../text-transcript.mjs';
import {combineRecognizedHeader,splitBoxesAtHeaders} from '../header-layout.mjs';
const row=(kind,text,y)=>({kind,text,bbox:{x0:50,y0:y,x1:450,y1:y+20}});
test('explicit Buddhist date and 24-hour time parse as one timestamp, not part of author',()=>{
 const s='Example 17/12/2569 BE, 22:26';const stamp=parseDiscordTimestamp(s);
 assert.equal(stamp.date,'December 17, 2026');assert.equal(stamp.time,'10:26 PM');assert.equal(s.slice(0,stamp.index),'Example ');
 assert.equal(s.slice(stamp.end),'');assert.equal(dateSeparator('17/12/2569 BE'),'December 17, 2026');
 assert.equal(parseHeader(s,'header').speaker,'Example');
});
test('clock normalization handles midnight, noon and legacy AM/PM without guessing',()=>{
 for(const [input,want] of [['00:05','12:05 AM'],['12:00','12:00 PM'],['23:59','11:59 PM'],['9:31 AM','9:31 AM'],['12:00 PM','12:00 PM']]) assert.equal(parseDiscordTimestamp(input,{allowBare24:true})?.time,want);
 for(const input of ['24:00','12:60','13:20 PM','7:xx','1.23','31/02/2569 BE, 22:26'])assert.equal(parseDiscordTimestamp(input,{allowBare24:true}),null,input);
 assert.equal(parseDiscordTimestamp('22:26'),null);assert.equal(dateFromOCR('11/27/26'),'November 27, 2026');
});
test('date and time alone do not create a new speaker from ordinary body or reply',()=>{
 assert.equal(classifyDiscordLine({text:'นัดเจอกันตอน 22:26'}).kind,'body');
 assert.equal(classifyDiscordLine({text:'นัดเจอวันที่ 17/12/2569 BE, 22:26'}).kind,'body');
 assert.equal(classifyDiscordLine({text:'Example 17/12/2569 BE, 22:26'},{coloredFraction:.4}).kind,'header');
 assert.equal(classifyDiscordLine({text:'@Example 17/12/2569 BE, 22:26'},{coloredFraction:.4}).kind,'reply');
 assert.equal(parseHeader('22:26','header'),null);assert.equal(parseHeader('@Example 10:26 PM','header'),null);
});
test('preserve date evidence and full original name when isolated crop cuts its prefix',()=>{
 const x=combineRecognizedHeader({full:'Example 22:26',nearby:'[01] Example 17/12/2569 BE, 22:26',nameOnly:'Example'});
 assert.equal(x.text,'[01] Example 17/12/2569 BE, 22:26');assert.equal(x.usedNameOnly,false);
 const y=combineRecognizedHeader({full:'Test user 22:26',nearby:'Test user TTO 17/12/2569 BE, 22:26',nameOnly:'Test user'});
 assert.equal(y.text,'Test user 17/12/2569 BE, 22:26');
});
test('existing reply and date rows survive overlapping header replacement',()=>{
 const rows=[row('reply','@Example quoted',35),row('date','17/12/2569 BE',35),row('header','Example 22:26',35)];
 const r=splitBoxesAtHeaders(rows,[{y0:34,y1:56}],600);
 assert.equal(r.lines[0].kind,'reply');assert.equal(r.lines[1].kind,'date');assert.equal(r.lines[2].kind,'covered');
});
test('transcript retains date transitions, multiple bodies and unknown top fragment',()=>{
 const result=assembleTextTranscript([row('body','ข้อความก่อนหน้า',0),row('header','Example 17/12/2569 BE, 22:26',30),row('body','ข้อความทดสอบ',60),row('body','นัดเวลา 23:00',90),row('reply','@Example ข้อความอ้างอิง',120),row('header','Tester 18/12/2569 BE, 00:01',150),row('body','ข้อความใหม่',180)]);
 const s=formatTextTranscript(result);
 assert.match(s,/^\[ไม่ทราบวันที่\]/);assert.match(s,/\[December 17, 2026\]\n\n\[Example\] - 10:26 PM\nข้อความทดสอบ\nนัดเวลา 23:00/);
 assert.match(s,/\[December 18, 2026\]\n\n> ตอบกลับ: @Example ข้อความอ้างอิง\n\[Tester\] - 12:01 AM\nข้อความใหม่/);
 assert.equal(result.unknownCount,1);
});
