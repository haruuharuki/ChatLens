import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runtimeSources,redactRuntimeError,diagnosticReport} from '../runtime-loader.mjs';

test('ORT sources are pinned and try browser-friendly classic WASM before module',()=>{
 const list=runtimeSources('1.22.0');
 assert.equal(list.length,3);
 assert.deepEqual(list.map(x=>x.kind),['classic','classic','module']);
 assert.ok(list[0].url.endsWith('/dist/ort.wasm.min.js'));
 assert.ok(list[1].url.includes('cdnjs.cloudflare.com'));
 assert.ok(list[2].url.endsWith('/dist/ort.wasm.min.mjs'));
 assert.ok(list.every(x=>x.wasmBase.startsWith('https://')));
 assert.ok(list.every(x=>x.url.includes('1.22.0')));
});

test('invalid or unpinned runtime version rejected',()=>{
 for(const v of ['latest','1.22','1.22.0?token=secret','1.22.0/foo']) assert.throws(()=>runtimeSources(v),/version/);
});

test('opaque Safari error is classified without exposing raw text',()=>{
 assert.equal(redactRuntimeError(new Error('Importing a module script failed.')),'ModuleImportFailed');
 assert.equal(redactRuntimeError(new Error('Failed to fetch')), 'NetworkOrCDN');
 assert.equal(redactRuntimeError(new Error('Out of memory')),'Memory');
});

test('diagnostic report omits user-provided contents and URL',()=>{
 const s=diagnosticReport({stage:'runtime-load',version:'1.22.0',attempts:[{label:'jsDelivr WASM-only',result:'failed'}],error:new Error('Importing a module script failed. file:///private/abc')});
 assert.match(s,/runtime-load/);
 assert.match(s,/ModuleImportFailed/);
 assert.doesNotMatch(s,/file:\/\/\/private|abc/);
 assert.doesNotMatch(s,/IMG_/);
});


test('Safari page cache-busts the ONNX experiment entrypoint and shows live build marker',()=>{
 const html=readFileSync(new URL('../openthai.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../openthai.js',import.meta.url),'utf8');
 assert.match(html,/src="\.\/openthai\.js\?build=b2-20261127"/);
 assert.match(html,/id="client-build"/);
 assert.match(html,/Phase B\.2/);
 assert.match(script,/CLIENT_BUILD='B\.2-20261127'/);
 assert.match(script,/\$\('client-build'\)/);
});

test('Safari entrypoint cache-busts runtime loader helper too',()=>{
 const script=readFileSync(new URL('../openthai.js',import.meta.url),'utf8');
 assert.match(script,/runtime-loader\.mjs\?build=b2-20261127/);
 assert.match(script,/ทดลอง OpenThai ไม่สำเร็จ/);
});
