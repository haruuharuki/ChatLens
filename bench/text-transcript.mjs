/**
 * Screenshot OCR -> best-effort Discord chat transcript. Experimental, no API.
 * Never infer missing dates, senders, time or text. A 'region' is not a message.
 * OCR engines work on separate line/region crops; the consumer can inspect source.
 */
import {dateFromOCR,dateSeparator,parseDiscordTimestamp} from './discord-timestamp.mjs?v=d1c';
export {dateFromOCR};
import {resolveBodyRows,hasBodyAlternative,selectBilingualText,observedMarkReading,selectReplyContinuation} from './region-output.mjs?v=e3';
const THAI=/[\u0e01-\u0e5b]/;
const EMPTY_ART=/^(?:[._\-–—\d\s!"'`~@#%&*()+=<>?\/\\|:;]+)$/;
function scrub(s){return String(s||'').normalize('NFC').replace(/\r/g,'').trim();}
export function parseHeader(text,kind){
 const s=scrub(text).replace(/\s*\(edited\)\s*$/i,'');
 const match=parseDiscordTimestamp(s,{allowBare24:true});if(!match)return null;
 if(!['header','mixed'].includes(kind))return null;
 const prefix=s.slice(0,match.index).replace(/^(?:[•.,"'\\]+|(?:pi|DP|BD)\s+|\d[%)]\s*)+/i,'').trim();
 // Reject a long sentence with a casual timestamp, and single letter junk.
 if(/^@/.test(prefix)||prefix.length<2||prefix.length>100||!/[\p{L}]/u.test(prefix)||prefix.split(/\s+/).length>12)return null;
 const speaker=prefix.replace(/\s*(?:\[(?:TTO|DAV|APP|MEOW)\]|(?:TTO|DAV|APP|MEOW))\s*$/i,'').trim();
 return {speaker:speaker||prefix,time:match.time,date:match.date,tail:s.slice(match.end).trim()};
}
// The diagnostic full-row re-read is a real observed alternative, not a
// guessed name. Use it only for the same parsed date/time, same Thai suffix
// and an observed Latin name that the earlier isolated crop lost; or when
// it exactly removes a leading OCR artifact from a structured username.
export function chooseHeaderReading(row,raw){
 const old=parseHeader(raw,row.kind),next=parseHeader(row.baseline,row.kind);
 if(!row.layoutHeader||row.kind!=='header'||!old||!next||old.time!==next.time||old.date!==next.date||next.tail||old.tail)return old;
 const a=old.speaker,b=next.speaker;
 const mixed=b.match(/([A-Za-z]{2,}(?:[-_][A-Za-z]{2,})*)\s*\|\s*([\u0e01-\u0e5b][^|]*)$/u);
 if(mixed&&a.split('|').at(-1).trim()===mixed[2].trim()&&!a.toLowerCase().includes(mixed[1].toLowerCase()))return next;
 if(a.endsWith(b)&&a!==b&&/^(?:\[(?:[0-9]{1,2}|staff)\]|multiple$)/i.test(b)&&/^[^\p{L}]{1,5}$/u.test(a.slice(0,-b.length)))return next;
 return old;
}
function substantive(t){const s=scrub(t);return !!s&&s.length<=1200&&!EMPTY_ART.test(s)&&(/[\p{L}\p{N}]/u.test(s));}
function isUI(s){return /^(?:#\s*[A-Za-z][\w-]*|\d{1,3}\s+Online\b|Message\s*#|\b(?:\d{1,2}:\d{2})\b\s*[5G]*)$/i.test(s);}
function bodyText(row,kind){
 if(typeof row.truth==='string'&&row.truth.trim())return scrub(row.truth);
 const c=scrub(row.candidate),base=scrub(row.baseline??row.text);
 // A highlighted mention is actual body text. Keep an observed complete
 // mention reading if a later OCR pass lost its colored prefix.
 if(row.mention){
  const observed=[base,scrub(row.originalText??row.text),c].map(t=>{const i=t.indexOf('@');return i>=0?t.slice(i):'';}).filter(Boolean);
  if(observed.length)return observedMarkReading(observed[0],observed[1]??observed[0],observed[2]??observed[0]); // complete observed tag; never invent a name
 }

 // Single-line OpenThai on a multi-line mixed raw block: crop was body-only.
 if(kind==='reply'&&row.replyIdentity){
  if(!row.replyBodyRead||!row.replyNameResolution?.speaker)return scrub(row.originalText??row.text);
  const body=(!row.error&&c&&substantive(c))?selectBilingualText(c,base,base):base;
  return substantive(body)?'@'+row.replyNameResolution.speaker+' '+body:scrub(row.originalText??row.text);
 }
 if(kind==='reply'&&row.replyContinuation&&!row.error&&substantive(c))return selectReplyContinuation(base,c,row.originalText??row.text??base);
 if(kind==='reply'&&(row.bitmap||row.textLeft)&&!row.error&&c&&substantive(c))return selectBilingualText(c,base,row.originalText??row.text??base);
 if(['body','mixed','fragment'].includes(kind)&&!row.error&&c&&substantive(c)){const chosen=selectBilingualText(c,base,row.originalText??row.text??base,{shortFragment:kind==='fragment',reconcileMarks:kind!=='mixed'});return row.edgeTextTop!=null?chosen.replace(/^[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]+\s*/u,''):chosen;}
 return base;
}
/**
 * Pass all detected regions, not just selected ones, so date and headers aren't
 * lost when only body lines were sampled. OCR results are optional for rows.
 * Exclude image-only regions and mark uncertainty instead of inventing text.
 */
export function assembleTextTranscript(rows=[]){
 const sorted=(Array.isArray(rows)?rows:[]).filter(x=>x&&x.bbox).slice()
  .sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
 const resolved=resolveBodyRows(sorted,bodyText),ordered=resolved.rows;let duplicateCount=resolved.suppressed;
 const output=[],warnings=[];let current=null,date=null,pendingReply=null,graphics=0;
 function flush(){if(!current)return;current.body=current.parts.join('\n').trim();delete current.parts;
   if(current.body||current.reply)output.push(current);current=null;}
 function pushBody(text,box,row){const s=scrub(text);if(!substantive(s)||isUI(s))return;
   if(!current){current={speaker:null,time:null,date,reply:null,parts:[],uncertain:true};}
   if(current.lastY!==undefined&&box&&box.y0-current.lastY>180&&current.speaker){flush();current={speaker:null,time:null,date,reply:null,parts:[],uncertain:true};warnings.push('ข้อความแยกห่างจากหัวข้อความมาก จึงไม่เดาผู้พูด');}
   const paragraph=Boolean(row?.paragraphBefore&&current.parts.length);if(paragraph)current.parts.push('');
   const line=row?.bullet&&row.bulletRead&&!row.truth?'- '+s:s;current.parts.push(line);(current.sourceLines??=[]).push({text:line,box,paragraph,edge:!!row?.edgePartial});current.lastY=box?.y1;
 }
 for(let index=0;index<ordered.length;index++){
   const r=ordered[index];
   const kind=r.kind||'fragment';const raw=scrub(r.originalText??r.text??r.rawBaseline??r.baseline);
   if(kind==='graphic'){graphics++;continue;}
	   if(kind==='covered')continue; // original overlapping OCR header or clipped viewport edge
   if(!raw && !r.candidate && !r.truth)continue;
   const parsedDate=dateSeparator(raw);
   if(parsedDate && (kind==='date'||kind==='fragment')){
     flush();if(date!==parsedDate)output.push({dateMarker:parsedDate});date=parsedDate;pendingReply=null;continue;
   }
   let head=r.mention?null:chooseHeaderReading(r,raw);
   const chosen=r.nameResolution;
   if(head&&chosen&&chosen.time===head.time&&chosen.date===head.date){
    head={...head,speaker:chosen.speaker};
    if(chosen.uncertain&&!warnings.includes('ผลอ่านชื่อไม่ตรงกัน — ตรวจชื่อผู้พูดจากภาพต้นฉบับ'))warnings.push('ผลอ่านชื่อไม่ตรงกัน — ตรวจชื่อผู้พูดจากภาพต้นฉบับ');
   }
   if(head){
     if(r.clippedName){head={...head,speaker:null};warnings.push('ชื่อผู้พูดถูกตัดขอบภาพ — ไม่เดาชื่อ');}
     flush();if(head.date&&head.date!==date){date=head.date;output.push({dateMarker:date});}current={speaker:head.speaker,time:head.time,date,reply:pendingReply,parts:[],uncertain:Boolean(r.clippedName),headerBox:r.bbox,lastY:r.bbox.y1};pendingReply=null;
     const mixedBody=kind==='mixed'?(scrub(r.truth)||(!r.error&&r.bodyOnly!==false&&substantive(r.candidate)?(r.bodyOnly?selectBilingualText(r.candidate,r.baseline,r.baseline,{reconcileMarks:false}):scrub(r.candidate)):head.tail)):head.tail;
     const source=r.headerTailBox??(r.bodyBand?{...r.bbox,y0:r.bbox.y0+r.bodyBand.top,y1:r.bbox.y0+r.bodyBand.bottom}:r.bbox);
     if(mixedBody&&substantive(mixedBody)){
       if(!scrub(r.truth)&&hasBodyAlternative(ordered,index,source,mixedBody,bodyText))duplicateCount++;
       else pushBody(mixedBody,r.bbox);
     }
     continue;
   }
   if(kind==='reply'){
     const reply=bodyText(r,kind);
     if(r.replyNameResolution?.uncertain&&r.replyBodyRead&&!warnings.includes('ชื่อใน Reply เชื่อมจากรูปตัวอักษรในภาพเดียวกัน — ยังต้องตรวจสอบ'))warnings.push('ชื่อใน Reply เชื่อมจากรูปตัวอักษรในภาพเดียวกัน — ยังต้องตรวจสอบ');
     // Only preview quotes, not normal mentions, can become reply notes.
     if(reply&&substantive(reply)){if(r.replyContinuation&&pendingReply)pendingReply+='\n'+reply;else pendingReply=reply;}
     continue;
   }
   if(kind==='mixed'){
     flush();warnings.push('พบกรอบชื่อ+เนื้อหาที่แยกเวลาไม่ชัด จึงไม่เดาผู้พูด');
     current={speaker:null,time:null,date,reply:pendingReply,parts:[],uncertain:true,lastY:r.bbox.y1};pendingReply=null;
     const mixedText=scrub(r.truth)||(!r.error&&r.bodyOnly!==false&&substantive(r.candidate)?(r.bodyOnly?selectBilingualText(r.candidate,r.baseline,r.baseline,{reconcileMarks:false}):scrub(r.candidate)):'');
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
     if(kind==='fragment' && !THAI.test(text) && !/[A-Za-z]{3,}/.test(text) && !(/^[A-Za-z]{2}$/u.test(text)&&(scrub(r.truth).toLowerCase()===text.toLowerCase()||(!r.error&&scrub(r.candidate).toLowerCase()===text.toLowerCase()&&scrub(r.baseline??r.text).toLowerCase()===text.toLowerCase()))))continue;
     pushBody(text,r.bbox,r);
   }
 }
 flush();
 if(pendingReply)warnings.push('มีข้อความตอบกลับที่ระบุหัวข้อความปลายทางไม่ได้');
 if(graphics)warnings.push(`ข้ามภาพ/อีโมจิที่สงสัย ${graphics} กรอบ (ยังไม่รับประกันว่าตรวจภาพครบ)`);
 if(!output.some(x=>x.dateMarker))warnings.push('ไม่พบวันที่ที่ยืนยันได้ในภาพ — ไม่เดาวันที่จากเวลาเครื่อง');
 return {entries:output,warnings,graphicCount:graphics,duplicateCount,unknownCount:output.filter(x=>!x.dateMarker&&!x.speaker).length};
}
export function formatTextTranscript(result){
 const lines=[],entries=result?.entries||[];
 if(entries.length===0||!entries[0].dateMarker)lines.push('[ไม่ทราบวันที่]');
 for(const e of entries){
   if(e.dateMarker){lines.push(`[${e.dateMarker}]`);continue;}
   const head=`[${e.speaker||'ไม่ทราบผู้พูด'}] - ${e.time||'ไม่ทราบเวลา'}`;
   const reply=e.reply?`> ตอบกลับ: ${e.reply.replace(/\n/g,'\n> ')}\n`:'';
   lines.push(reply+head+'\n'+(e.body||'[ยังอ่านข้อความไม่ครบ]'));
 }
 return lines.join('\n\n').trim();
}
