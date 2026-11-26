import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOverlap, mergeSegments, splitText, exportMarkdown } from '../lib/merge.mjs';

test('adjacent multi-line overlap removed once', () => {
  const r = mergeSegments([
    { text: 'A: วันนี้ทำอะไรดี\nB: ทำอาหารไหม\nC: มีเห็ดเหลืออยู่' },
    { text: 'B: ทำอาหารไหม\nC: มีเห็ดเหลืออยู่\nA: งั้นทำซุปกัน' },
  ]);
  assert.equal((r.text.match(/C: มีเห็ดเหลืออยู่/g) || []).length, 1);
  assert.equal((r.text.match(/ทำซุป/g) || []).length, 1);
  assert.equal(r.notices[0].type, 'overlap');
});

test('single repeated line never removed automatically', () => {
  assert.equal(detectOverlap('A: ตกลง', 'A: ตกลง\nB: ได้เลย'), 0);
});

test('unknown boundary is reported not fabricated', () => {
  const r = mergeSegments([{text:'Alpha'}, {text:'Beta'}]);
  assert.match(r.text, /ตรวจสอบรอยต่อ/);
  assert.equal(r.notices[0].type, 'uncertain');
});

test('empty frame surfaces a notice', () => {
  assert.equal(mergeSegments([{text:''}]).notices[0].type, 'empty');
});

test('long text split to bounded pieces', () => {
  const parts = splitText('x'.repeat(1005), 400);
  assert.deepEqual(parts.map(x => x.length), [400,400,205]);
});

test('export includes source audit info', () => {
  const md = exportMarkdown([{ text:'hello', source:'shot.png', confidence:85 }]);
  assert.match(md,/shot\.png/);
  assert.match(md,/OCR 85%/);
});
