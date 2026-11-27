/**
 * Pinned browser runtime candidates for the optional OpenThai line experiment.
 * Prefer an ordinary <script> (WASM-only ONNX Runtime Web) because cross-origin
 * dynamic ESM imports can fail with an opaque error on iOS Safari.
 * No screenshot bytes or transcriptions are sent to these URLs.
 */
export function runtimeSources(version = '1.22.0') {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid pinned runtime version');
  const jsdelivr = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
  const cdnjs = `https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/${version}/`;
  return [
    {kind:'classic', label:'jsDelivr WASM-only', url:jsdelivr+'ort.wasm.min.js', wasmBase:jsdelivr},
    {kind:'classic', label:'cdnjs WASM-only', url:cdnjs+'ort.wasm.min.js', wasmBase:cdnjs},
    {kind:'module', label:'jsDelivr WASM ESM', url:jsdelivr+'ort.wasm.min.mjs', wasmBase:jsdelivr}
  ];
}

export function redactRuntimeError(error) {
  // Browser load failures may contain page/query URLs, which can reveal local
  // data or identifiers. This diagnostic deliberately emits only a short class.
  const message=String(error?.message||error||'unknown');
  if(/importing a module script failed|failed to fetch dynamically imported module/i.test(message))return 'ModuleImportFailed';
  if(/cors|cross.origin/i.test(message))return 'CORSBlocked';
  if(/network|failed to fetch|load failed/i.test(message))return 'NetworkOrCDN';
  if(/timeout/i.test(message))return 'Timeout';
  if(/out of memory|allocation failed|oom/i.test(message))return 'Memory';
  if(/invalid|unsupported|opset|wasm|tensor|onnx/i.test(message))return 'ModelOrWASM';
  return 'Other';
}

export function diagnosticReport({stage,version,attempts=[],error}) {
  return [
    'ChatLens OpenThai Phase B.1 (no screenshot/chat content)',
    `stage: ${stage||'unknown'}`,
    `onnxruntime-web: ${version||'unknown'}`,
    `runtime attempts: ${attempts.map(a=>`${a.label||'unknown'}=${a.result||'unknown'}`).join(', ')||'not attempted'}`,
    `failure class: ${redactRuntimeError(error)}`,
    'OpenThai result: not confirmed',
    'This report contains no usernames, file paths, OCR text or screenshots.'
  ].join('\n');
}
