import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeForComparison,graphemes,editDistance,evaluateText,evaluateAlignedSamples} from '../metrics.mjs';

test('Thai sara-am alternate representation matches after conservative normalization',()=>{
  assert.equal(normalizeForComparison('ทํา'),normalizeForComparison('ทำ'));
  assert.equal(evaluateText('ทำ','ทํา').strictCer,0);
});
test('Thai combining marks group as graphemes not UTF-16 units',()=>{
  assert.ok(graphemes('เก่ง').length<=5);
  assert.equal(editDistance(['ก','ข'],['ก','ค']),1);
});
test('CER is zero for identical, positive for errors and may exceed 1 for extra text',()=>{
  assert.equal(evaluateText('สวัสดี','สวัสดี').strictCer,0);
  assert.ok(evaluateText('สวัสดี','สวัดดี').strictCer>0);
  assert.ok(evaluateText('ก','กขคง').strictCer>1);
});
test('do not treat whitespace-only missing ground truth as zero error',()=>{
  assert.equal(evaluateText('','คำตอบ'),null);
  assert.equal(evaluateText('   ','คำตอบ'),null);
});
test('whitespace-insensitive CER allows line wrap changes without erasing original',()=>{
  const s=evaluateText('ประโยค\nต่อไป','ประโยค ต่อไป');
  assert.ok(s.strictCer>0);
  assert.equal(s.compactCer,0);
});
test('weighted aggregate counts characters, not average sample percentages',()=>{
  const r=evaluateAlignedSamples([{id:'A',reference:'ก',recognized:'ข'},{id:'B',reference:'ตัวอย่างที่ยาวกว่า',recognized:'ตัวอย่างที่ยาวกว่า'}]);
  assert.equal(r.summary.samples,2);
  assert.equal(r.summary.strictEdits,1);
  assert.equal(r.summary.strictCer,1/r.summary.referenceGraphemes);
});
