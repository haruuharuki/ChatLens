import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../batch.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../batch.js',import.meta.url),'utf8');

test('Phase C.2 has opt-out geometry plus a review panel for skipped lines',()=>{
 assert.match(html,/Phase D\.3a\.1–c/);
 assert.match(html,/id="layout-focus"/);
 assert.match(html,/id="review-panel"/);
 assert.match(html,/id="review-lines"/);
 assert.match(html,/id="review"/);
 assert.match(html,/batch\.js\?build=phase-d3abc-20261128/);
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

test('Phase C.3 distinguishes image-only and mixed regions and allows optional right-edge expansion',()=>{
 assert.match(html,/id="extend-text"/);
 assert.match(js,/auditDetectedRegion\(/);
 assert.match(js,/extendTextRight\(/);
 assert.match(js,/imagePixels=null/);
 assert.match(js,/line\.kind==='graphic'/);
});


test('Phase D transcript preview and reversible character-color masking',()=>{
 assert.match(html,/id="text-only"/);
 assert.match(html,/id="transcript-panel"/);
 assert.match(html,/id="copy-transcript"/);
 assert.match(js,/maskNonTextColors\(/);
 assert.match(js,/assembleTextTranscript\(/);
 assert.match(js,/formatTextTranscript\(/);
});

test('Phase D.1 reads independent colored header bands before transcript',()=>{
 assert.match(js,/discoverHeaderBands\(/);
 assert.match(js,/splitBoxesAtHeaders\(/);
 assert.match(js,/rereadRegion\(/);
});

test('Phase D.1 run refreshes transcript using OpenThai candidates but preserves manual edits',()=>{
 assert.match(js,/finally\{toggleBusy\(false\);refreshStats\(\);if\(ocrLines\.length\)refreshTranscript\(\);\}/);
 assert.match(js,/if\(transcriptEdited&&!force\)return;/);
 assert.doesNotMatch(js,/transcriptEdited=false;items=selected\.map/);
});

test('D.1b independent-header detection is reversible and reads name-only strip',()=>{assert.match(html,/id="layout-headers"/);assert.match(js,/combineRecognizedHeader/);assert.match(js,/nameBox=\{\.\.\.headerBox/);});

test('D.1c simple default selects all text and puts editable transcript before advanced results',()=>{
 assert.match(html,/<option value="all" selected>/);
 assert.ok(html.indexOf('id="advanced-settings"')<html.indexOf('id="scope"'));
 assert.ok(html.indexOf('id="transcript-panel"')<html.indexOf('id="advanced-results"'));
 assert.doesNotMatch(html,/<details id="advanced-(?:settings|results)"[^>]*\bopen\b/);
 assert.match(js,/if\(!nearby&&!parseDiscordTimestamp\(reread\)\)continue;/);
});

test('D.2c.3–4 + D.3a wires pre-OCR backup, structural classification and raw tight name reading',()=>{
 assert.match(js,/const primary=redundantSplit\(/);
 assert.match(js,/alternateBody:true,primaryBox:primary\.bbox/);
 assert.match(js,/const tightName=isolateNameBox\(/);
 assert.match(js,/rereadRegion\(\{bbox:tightName\|\|nameBox\},'header',tightName\?2:1\)/);
 assert.match(js,/ocrLines=classifyStructure\(/);
 assert.match(js,/needsAlternateReading\(item\.baseline,item\.candidate,item\.error\)/);
});
