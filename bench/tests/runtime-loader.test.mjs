import test from 'node:test';
import assert from 'node:assert/strict';
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
