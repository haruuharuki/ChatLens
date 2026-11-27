/**
 * Screenshot OCR -> best-effort Discord chat transcript. Experimental, no API.
 * Never infer missing dates, senders, time or text. A 'region' is not a message.
 * OCR engines work on separate line/region crops; the consumer can inspect source.
 */
const CLOCK=/\b(?:0?[1-9]|1[0-2])[:.][0-5]\d\s*(?:AM|PM)\b/i;
const DATE_EN=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i;
const DATE_NUM=/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2}|\d{2})\b/;
const THAI=/[\u0e01-\u0e5b]/;
const EMPTY_ART=/^(?:[._\-–—\d\s!"'`~@#%&*()+=<>?\/\\|:;]+)$/;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
export function dateFromOCR(text){
 const s=String(text||'').trim(),en=s.match(DATE_EN);
 if(en){const m=MONTHS.findIndex(x=>x.toLowerCase()===en[1].toLowerCase())+1,d=Number(en[2]),y=Number(en[3]);return isValid(m,d,y)?`${MONTHS[m-1]} ${d}, ${y}`:null;}
 const n=s.match(DATE_NUM);if(!n)return null;
 const m=Number(n[1]),d=Number(n[2]),y=Number(n[3].length===2?`20${n[3]}`:n[3]);
 return isValid(m,d,y)?`${MONTHS[m-1]} ${d}, ${y}`:null;
}
function isValid(m,d,y){const dt=new Date(Date.UTC(y,m-1,d));return m>=1&&m<=12&&y>=2000&&y<=2099&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;}
function scrub(s){return String(s||'').normalize('NFC').replace(/\r/g,'').trim();}
function parseHeader(text,kind){
 const s=scrub(text).replace(/\s*\(edited\)\s*$/i,'');
 const match=CLOCK.exec(s);if(!match)return null;
 if(!['header','mixed'].includes(kind))return null;
 const prefix=s.slice(0,match.index).replace(/^(?:[•.,"'\\]+|(?:pi|DP|BD)\s+|\d[%)]\s*)+/i,'').trim();
 // Reject a long sentence with a casual timestamp, and single letter junk.
 if(prefix.length<2||prefix.length>100||!/[\p{L}]/u.test(prefix)||prefix.split(/\s+/).length>12)return null;
 const speaker=prefix.replace(/\s*(?:\[(?:TTO|DAV|APP|MEOW)\]|(?:TTO|DAV|APP|MEOW))\s*$/i,'').trim();
 return {speaker:speaker||prefix,time:match[0].replace(/\s*(AM|PM)$/i,(_,ap)=>' '+ap.toUpperCase()).replace('.',':'),tail:s.slice(match.index+match[0].length).trim()};
}
function substantive(t){const s=scrub(t);return !!s&&s.length<=1200&&!EMPTY_ART.test(s)&&(/[\p{L}\p{N}]/u.test(s));}
function isUI(s){return /^(?:#\s*[A-Za-z][\w-]*|\d{1,3}\s+Online\b|Message\s*#|\b(?:\d{1,2}:\d{2})\b\s*[5G]*)$/i.test(s);}
function bodyText(row,kind){
 if(typeof row.truth==='string'&&row.truth.trim())return scrub(row.truth);
 const c=scrub(row.candidate),base=scrub(row.baseline??row.text);
 // Single-line OpenThai on a multi-line mixed raw block: crop was body-only.
 if(['body','mixed','fragment'].includes(kind)&&!row.error&&c&&substantive(c))return c;
 return base;
}
/**
 * Pass all detected regions, not just selected ones, so date and headers aren't
 * lost when only body lines were sampled. OCR results are optional for rows.
 * Exclude image-only regions and mark uncertainty instead of inventing text.
 */
export function assembleTextTranscript(rows=[]){
 const ordered=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.bbox).slice()
  .sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
 const output=[],warnings=[];let current=null,date=null,pendingReply=null,graphics=0;
 function flush(){if(!current)return;current.body=current.parts.join('\n').trim();delete current.parts;
   if(current.body||current.reply)output.push(current);current=null;}
 function pushBody(text,box){const s=scrub(text);if(!substantive(s)||isUI(s))return;
   if(!current){current={speaker:null,time:null,date,reply:null,parts:[],uncertain:true};}
   if(current.lastY!==undefined&&box&&box.y0-current.lastY>180&&current.speaker){flush();current={speaker:null,time:null,date,reply:null,parts:[],uncertain:true};warnings.push('ข้อความแยกห่างจากหัวข้อความมาก จึงไม่เดาผู้พูด');}
   current.parts.push(s);current.lastY=box?.y1;
 }
 for(const r of ordered){
   const kind=r.kind||'fragment';const raw=scrub(r.originalText??r.text??r.rawBaseline??r.baseline);
   if(kind==='graphic'){graphics++;continue;}
	   if(kind==='covered')continue; // original overlapping OCR header; targeted header replaces it
   if(!raw && !r.candidate && !r.truth)continue;
   const parsedDate=dateFromOCR(raw);
   if(parsedDate && (/^(?:\w+\s+\d+,?\s+20\d\d|\d+\/\d+\/\d+)/.test(raw)) && raw.length<45){
     flush();if(date!==parsedDate)output.push({dateMarker:parsedDate});date=parsedDate;pendingReply=null;continue;
   }
   const head=parseHeader(raw,kind);
   if(head){
     flush();current={speaker:head.speaker,time:head.time,date,reply:pendingReply,parts:[],uncertain:false,lastY:r.bbox.y1};pendingReply=null;
     const mixedBody=kind==='mixed'?(scrub(r.truth)||(!r.error&&substantive(r.candidate)?scrub(r.candidate):head.tail)):head.tail;
     if(mixedBody&&substantive(mixedBody))pushBody(mixedBody,r.bbox);
     continue;
   }
   if(kind==='reply'){
     const reply=bodyText(r,kind);
     // Only preview quotes, not normal mentions, can become reply notes.
     if(reply&&substantive(reply))pendingReply=reply;
     continue;
   }
   if(kind==='mixed'){
     flush();warnings.push('พบกรอบชื่อ+เนื้อหาที่แยกเวลาไม่ชัด จึงไม่เดาผู้พูด');
     current={speaker:null,time:null,date,reply:pendingReply,parts:[],uncertain:true,lastY:r.bbox.y1};pendingReply=null;
     const mixedText=scrub(r.truth)||(!r.error&&substantive(r.candidate)?scrub(r.candidate):'');
     if(mixedText)pushBody(mixedText,r.bbox);
     continue;
   }
   if(kind==='header'){
     flush();warnings.push('พบหัวข้อความที่อ่านชื่อหรือเวลาไม่ชัด และไม่เดาผู้พูด');
     current={speaker:null,time:null,date,reply:pendingReply,parts:[],uncertain:true,lastY:r.bbox.y1};pendingReply=null;
     // Unrecognized colored header is diagnostic, not chat body.
     continue;
   }
   if(kind==='body'||kind==='mixed'||kind==='fragment'){
     const text=bodyText(r,kind);
     if(!text||isUI(text))continue;
     if(kind==='fragment' && !THAI.test(text) && !/[A-Za-z]{3,}/.test(text))continue;
     pushBody(text,r.bbox);
   }
 }
 flush();
 if(pendingReply)warnings.push('มีข้อความตอบกลับที่ระบุหัวข้อความปลายทางไม่ได้');
 if(graphics)warnings.push(`ข้ามภาพ/อีโมจิที่สงสัย ${graphics} กรอบ (ยังไม่รับประกันว่าตรวจภาพครบ)`);
 if(!output.some(x=>x.dateMarker))warnings.push('ไม่พบวันที่ที่ยืนยันได้ในภาพ — ไม่เดาวันที่จากเวลาเครื่อง');
 return {entries:output,warnings,graphicCount:graphics,unknownCount:output.filter(x=>!x.dateMarker&&!x.speaker).length};
}
export function formatTextTranscript(result){
 const lines=[],entries=result?.entries||[];
 if(!entries.some(e=>e.dateMarker))lines.push('[ไม่ทราบวันที่]');
 for(const e of entries){
   if(e.dateMarker){lines.push(`[${e.dateMarker}]`);continue;}
   const head=`[${e.speaker||'ไม่ทราบผู้พูด'}] - ${e.time||'ไม่ทราบเวลา'}`;
   const reply=e.reply?`> ตอบกลับ: ${e.reply}\n`:'';
   lines.push(reply+head+'\n'+(e.body||'[ยังอ่านข้อความไม่ครบ]'));
 }
 return lines.join('\n\n').trim();
}
