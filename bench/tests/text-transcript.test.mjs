import test from 'node:test';
import assert from 'node:assert/strict';
import {dateFromOCR,assembleTextTranscript,formatTextTranscript} from '../text-transcript.mjs';
const row=(kind,text,y,candidate=null)=>({kind,text,bbox:{x0:60,y0:y,x1:500,y1:y+27},candidate});
test('Discord date separator parsed, invalid calendar date rejected',()=>{
 assert.equal(dateFromOCR('November 27, 2026'),'November 27, 2026');
 assert.equal(dateFromOCR('11/27/26'),'November 27, 2026');
 assert.equal(dateFromOCR('02/31/26'),null);
});
test('structure multi-line body and keep one header only (no profile/reaction nonsense)',()=>{
 const rows=[row('fragment','November 27, 2026',0),row('header','Multiple 9:31 AM',32),row('body','มีใครดูมาโดโกะ ไหมครับมูฟวี่อันใหม่',70),row('body','เสียใจ',106),row('graphic','7',135),row('header','02 | มินาเสะ ซาโยะ | แป้งไหน 9:48 AM',200),row('body','ผปค วิริยะ',237)];
 const result=assembleTextTranscript(rows),s=formatTextTranscript(result);
 assert.match(s,/\[November 27, 2026\]/);
 assert.match(s,/\[Multiple\] - 9:31 AM\nมีใครดูมาโดโกะ ไหมครับมูฟวี่อันใหม่\nเสียใจ/);
 assert.match(s,/\[02 \| มินาเสะ ซาโยะ \| แป้งไหน\] - 9:48 AM\nผปค วิริยะ/);
 assert.doesNotMatch(s,/\n7\n/);assert.equal(result.graphicCount,1);
});
test('mixed header/body gets body-only OCR, not repeated author',()=>{
 const a=assembleTextTranscript([row('mixed','Multiple 9:31 AM มีใครดูมาโดโกะ',20,'มีใครดูมาโดโกะ'),row('body','เสียใจ',70,'เสียใจ')]);
 assert.match(formatTextTranscript(a),/\[Multiple\] - 9:31 AM\nมีใครดูมาโดโกะ\nเสียใจ/);
});
test('keep unknown speaker when screenshot starts mid-message; never infer date',()=>{
 const s=formatTextTranscript(assembleTextTranscript([row('body','ไม่เป็นไร',20)]));
 assert.match(s,/\[ไม่ทราบวันที่\]/);
 assert.match(s,/\[ไม่ทราบผู้พูด\] - ไม่ทราบเวลา\nไม่เป็นไร/);
});
test('unreliable name/date header not attached to previous person',()=>{
 const s=formatTextTranscript(assembleTextTranscript([row('header','Multiple 9:31 AM',20),row('body','ข้อความแรก',60),row('header','[Staff] เจีย 1:xx PM',100),row('body','ข้อความใหม่',140)]));
 assert.match(s,/\[ไม่ทราบผู้พูด\] - ไม่ทราบเวลา\nข้อความใหม่/);
});
test('replies appear before sender if followed by valid header',()=>{
 const s=formatTextTranscript(assembleTextTranscript([row('reply','@Multiple วันนี้สนุก',5),row('header','[Staff] เจีย 1:53 PM',42),row('body','เห็นด้วยจ้า',79)]));
 assert.match(s,/> ตอบกลับ: @Multiple วันนี้สนุก\n\[\[Staff\] เจีย\] - 1:53 PM/);
});
test('manually corrected text takes precedence over inferred OCR',()=>{
 const a=row('body','อ่านผิด',65,'อ่านต่าง');a.truth='ข้อความแก้แล้ว';
 const s=formatTextTranscript(assembleTextTranscript([row('header','Multiple 9:31 AM',20),a]));
 assert.match(s,/ข้อความแก้แล้ว/);assert.doesNotMatch(s,/อ่านต่าง/);
});
test('ignore graphics, empty lines, misleading timestamp in ordinary body',()=>{
 const rows=[row('header','Multiple 9:31 AM',0),row('body','นัดเวลา 10:30 AM นะ',35),row('graphic','some photo',75),row('body','555',115)];
 const s=formatTextTranscript(assembleTextTranscript(rows));
 assert.match(s,/นัดเวลา 10:30 AM นะ/);assert.doesNotMatch(s,/some photo/);
});
