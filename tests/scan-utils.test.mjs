import test from 'node:test';
import assert from 'node:assert/strict';
import {discordCropRect,firstDiscordTimestamp,checkSegmentsForReview} from '../lib/scan-utils.mjs';
test('mobile Discord crop excludes header/composer, keeps middle',()=>{
  const c=discordCropRect(816,1778,true);
  assert.equal(c.cropped,true);
  assert.ok(c.y>215 && c.y<260);
  assert.ok(c.y+c.height>1570 && c.y+c.height<1660);
});
test('observed iPhone screenshot layout retains first speaker and skips composer',()=>{
  // Derived only from screenshot geometry; NO private screenshot bytes committed.
  const c=discordCropRect(1206,2622,true);
  assert.ok(c.y>=330 && c.y<370); // first username begins at y=375 in IMG_6770
  assert.ok(c.y+c.height<=2330 && c.y+c.height>=2315); // composer starts about y=2330
  assert.ok(c.x>90 && c.x<125); // removes avatar without losing text at x≈140
  assert.ok(c.x+c.width===1206);
});
test('desktop and disabled mode never crop',()=>{
  assert.equal(discordCropRect(1600,900,true).cropped,false);
  assert.equal(discordCropRect(816,1778,false).cropped,false);
});
test('reads valid date and rejects invalid date',()=>{
  assert.equal(firstDiscordTimestamp('11/14/26, 12:29 PM'),Date.UTC(2026,10,14,12,29));
  assert.equal(firstDiscordTimestamp('11/14/26, 12:24 AM'),Date.UTC(2026,10,14,0,24));
  assert.equal(firstDiscordTimestamp('02/31/26, 12:24 PM'),null);
});
test('out of order capture flagged, text never deleted',()=>{
  const data=[{text:'11/15/26, 10:15 AM\nต้นทาง'},{text:'11/14/26, 12:29 PM\nข้อความก่อนหน้า'}];
  assert.ok(checkSegmentsForReview(data).some(x=>x.type==='order'&&x.index===1));
  assert.equal(data[1].text.includes('ข้อความก่อนหน้า'),true);
});
test('OCR confidence alone does not declare transcript accurate',()=>{
  const low=checkSegmentsForReview([{kind:'image',text:'มีข้อความจำนวนมากให้ระบบตรวจ',confidence:65}]);
  assert.equal(low[0].type,'ocr');
  const high=checkSegmentsForReview([{kind:'image',text:'มีข้อความจำนวนมากให้ระบบตรวจ',confidence:95}]);
  assert.equal(high.some(x=>x.type==='ocr'),false);
});

test('photo placeholder triggers review but never deletes source text',()=>{
  const segment={text:'อังโกะทำแอปเปิลทาร์ต\n[ภาพแนบ]',kind:'image',hasMedia:true};
  assert.ok(checkSegmentsForReview([segment]).some(x=>x.type==='media'));
  assert.ok(segment.text.includes('อังโกะ'));
});
