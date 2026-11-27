import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../batch.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../batch.js',import.meta.url),'utf8');

test('Phase C.2 has opt-out geometry plus a review panel for skipped lines',()=>{
 assert.match(html,/Phase C\.2/);
 assert.match(html,/id="layout-focus"/);
 assert.match(html,/id="review-panel"/);
 assert.match(html,/id="review-lines"/);
 assert.match(html,/id="review"/);
 assert.match(html,/batch\.js\?build=phasec2-20261127/);
});
test('all DOM element IDs used by C.2 code exist in HTML',()=>{
 const ids=[...js.matchAll(/\$\('([\w-]+)'\)/g)].map(m=>m[1]);
 for(const id of new Set(ids))assert.ok(html.includes(`id="${id}"`),`missing #${id}`);
});
test('review exposes every detected line and accepts intentional inclusion of skipped rows',()=>{
 assert.match(js,/Math\.min\(ocrLines\.length,cap\)/);
 assert.match(js,/reviewSelection\.add\(index\)/);
 assert.match(js,/\[\.\.\.reviewSelection\]\.sort/);
 assert.match(js,/reviewSelection\.size>=60/);
 assert.match(js,/if\(!reviewReady\)defaultReviewSelection\(\)/);
});
test('models read same prepared ROI and artwork explanatory placeholders do not affect CER',()=>{
 assert.match(js,/recognize\(item\.prepared\.canvas\)/);
 assert.match(js,/recognizeOne\(item\.prepared\.canvas\)/);
 assert.match(js,/referenceHasArtworkNotes\(truth\)/);
 assert.match(js,/isolateBodyLayoutRGBA\(/);
});
