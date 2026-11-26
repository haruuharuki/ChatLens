/** File names are an ordering hint only; never infer message chronology for unknown names. */
export function captureNumber(name) {
  const hit = /^IMG[_-](\d{3,9})(?:\s*\(\d+\))?\.(?:png|jpe?g|webp|heic)$/i.exec(String(name || '').trim());
  return hit ? Number(hit[1]) : null;
}

export function sortCapturedFiles(files) {
  const items = Array.from(files || []);
  const keys = items.map(file => captureNumber(file.name));
  if (keys.some(key => key === null) || new Set(keys).size !== keys.length) return {files: items, reordered: false, supported: false};
  const sorted = items.map((file, index) => ({file,index,key:keys[index]}))
    .sort((a,b) => a.key - b.key || a.index-b.index).map(row=>row.file);
  return {files:sorted,reordered:sorted.some((file,i)=>file !== items[i]),supported:true};
}

/** Sort ONLY a collection of plain IMG screenshots, respecting a deliberate manual order. */
export function sortScreenshotSegments(segments, manuallyReordered = false) {
  if (manuallyReordered || segments.length < 2 || segments.some(s=>s.kind!=='image')) return false;
  const keys=segments.map(s=>captureNumber(s.source));
  if (keys.some(x=>x===null)||new Set(keys).size!==keys.length)return false;
  const original=segments.slice();
  segments.sort((a,b)=>captureNumber(a.source)-captureNumber(b.source));
  return segments.some((s,i)=>s!==original[i]);
}

/** Purely typographic Thai Unicode normalization, not guessed word correction. */
export function normalizeOCRText(input) {
  return String(input || '').replace(/\r\n?/g,'\n')
    .replace(/\u0E4D\u0E32/g,'\u0E33')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'')
    .trim();
}
