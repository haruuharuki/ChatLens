import test from 'node:test';
import assert from 'node:assert/strict';
import {captureNumber,sortCapturedFiles,sortScreenshotSegments,normalizeOCRText} from '../lib/capture-utils.mjs';

test('observed IMG_6768–6771 iPhone screenshots are ordered by capture number',()=>{
 const input=['IMG_6769.png','IMG_6770.png','IMG_6771.png','IMG_6768.png'].map(name=>({name}));
 const result=sortCapturedFiles(input);
 assert.deepEqual(result.files.map(x=>x.name),['IMG_6768.png','IMG_6769.png','IMG_6770.png','IMG_6771.png']);
 assert.equal(result.reordered,true);
});
test('mixed file names, duplicated numbers, and unknown formats retain selected order',()=>{
 assert.equal(sortCapturedFiles([{name:'abc.png'},{name:'IMG_1234.png'}]).supported,false);
 assert.equal(sortCapturedFiles([{name:'IMG_1234.png'},{name:'IMG_1234(1).png'}]).supported,false);
 assert.equal(captureNumber('IMG_6770(1).png'),6770);
});
test('existing image segments are corrected unless manually rearranged',()=>{
 const s=[{source:'IMG_6769.png',kind:'image'},{source:'IMG_6768.png',kind:'image'}];
 assert.equal(sortScreenshotSegments(s),true);
 assert.equal(s[0].source,'IMG_6768.png');
 assert.equal(sortScreenshotSegments(s,true),false);
});
test('non-image segments are not rearranged',()=>{
 const s=[{source:'IMG_6770.png',kind:'image'},{source:'text',kind:'text'},{source:'IMG_6768.png',kind:'image'}];
 assert.equal(sortScreenshotSegments(s),false);
 assert.equal(s[0].source,'IMG_6770.png');
});
test('Thai typography fixes decomposed sara am without rewriting content',()=>{
 assert.equal(normalizeOCRText('ทําอะไร\r\nนําไป'),'ทำอะไร\nนำไป');
 assert.equal(normalizeOCRText('ซาโขยะ'), 'ซาโขยะ');
});
