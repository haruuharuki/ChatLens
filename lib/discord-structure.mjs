/**
 * Discord mobile screenshot transcript formatter (experimental).
 * Lines come from the OCR engine's bounding boxes, NOT from Discord API.
 * Never guess an author or silently drop unclassified OCR text.
 */
import { normalizeOCRText } from './capture-utils.mjs';

const TIME_RE = /\b(?:(\d{1,2}\/\d{1,2}\/\d{2,4})\s*,?\s*)?((?:0?[1-9]|1[0-2])[:.][0-5]\d)\s*(AM|PM)\b/i;
const TIME_END_RE = /\b(?:(\d{1,2}\/\d{1,2}\/\d{2,4})\s*,?\s*)?((?:0?[1-9]|1[0-2])[:.][0-5]\d)\s*(AM|PM)\s*$/i;
const UI_RE = /^(?:#\s*\w[\w-]*|\d{1,3}\s*Online|Message\s*#\w+)/i;
const textSafe = value => normalizeOCRText(value ?? '');
function boxOf(line) {
  const b = line?.bbox || line?.box || line?.boundingBox || {};
  const x0=Number(b.x0 ?? b.left ?? line?.left), y0=Number(b.y0 ?? b.top ?? line?.top);
  const x1=Number(b.x1 ?? (Number.isFinite(x0) ? x0 + Number(b.width ?? line?.width) : NaN));
  const y1=Number(b.y1 ?? (Number.isFinite(y0) ? y0 + Number(b.height ?? line?.height) : NaN));
  return {x0,y0,x1,y1};
}

/** Flatten the nested Tesseract.js v6 `blocks: true` OCR result. */
export function extractOCRLines(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out=[];
  for (const block of blocks) for (const para of block?.paragraphs || []) for (const line of para?.lines || []) {
    const text=textSafe(line.text);
    if (!text) continue;
    const bbox=boxOf(line);
    if (![bbox.x0,bbox.y0,bbox.x1,bbox.y1].every(Number.isFinite)) continue;
    if (bbox.x1<=bbox.x0 || bbox.y1<=bbox.y0) continue;
    out.push({text,bbox,confidence:Number.isFinite(line.confidence)?line.confidence:null});
  }
  out.sort((a,b)=>a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0);
  return out;
}

/** Colored username pixels are a secondary hint only, never a truth source. */
export function coloredHeaderHint(data,width,height,bbox) {
  if (!data || !Number.isFinite(width) || !Number.isFinite(height) || data.length<width*height*4) return false;
  const b=boxOf({bbox});
  let start=Math.max(0,Math.floor(b.x0)), end=Math.min(width,Math.ceil(b.x1));
  const top=Math.max(0,Math.floor(b.y0)), bottom=Math.min(height,Math.ceil(b.y1));
  // Ignore timestamp on the far right; sample mostly speaker-name area.
  end=Math.min(end,start+Math.max(60,Math.floor(width*.57)));
  let colorful=0;
  for(let y=top;y<bottom;y+=2) for(let x=start;x<end;x+=2){
    const i=(y*width+x)*4,r=data[i],g=data[i+1],bl=data[i+2];
    if ((g>105 && g>r*1.22 && g>bl*1.07) ||
        (bl>120 && bl>g*1.11 && bl>r*1.14) ||
        (r>170 && g>105 && r>g*1.24 && g>bl*1.06)) colorful++;
  }
  // A few pixels, not a proportion of the entire dark line rectangle.
  return colorful >= Math.max(6,Math.round((bottom-top)*.22));
}

export function parseSpeakerHeader(input, options={}) {
  const text=textSafe(input).replace(/\s+/g,' ').trim();
  const match=text.replace(/\s*\(edited\)$/i,'').match(TIME_END_RE);
  if (!match) return null;
  let speaker=text.slice(0,match.index).trim();
  // Remove obviously isolated avatar/icon OCR noise at the left only.
  speaker=speaker.replace(/^(?:[•.,'"\\]+\s*|\d[%)]\s+|(?:pi|BD|DP)\s+(?=\[)|\d\s+(?=[A-Za-z\[]))+/i,'').trim();
  speaker=speaker.replace(/^[^\p{L}\p{N}\[]+/u,'').trim();
  if (speaker.length<2 || speaker.length>90 || !/[\p{L}]/u.test(speaker) || UI_RE.test(speaker)) return null;
  // Never interpret a long normal sentence mentioning a time as a new author.
  if (speaker.split(/\s+/).length>11) return null;
  // A weak OCR line is acceptable when its text looks like a username and has a timestamp.
  if (options.requireColor && !options.colorful) return null;
  const hhmm=match[2].replace('.',':');
  const date=match[1] || null;
  return {speaker,time:`${hhmm} ${match[3].toUpperCase()}`,date};
}

const isReply = t => /^@(?:(?:\[[^\]]+\])|[\p{L}\p{N}_-])/u.test(t.trim()) || /^↳\s/.test(t.trim());

/** Create entries, including unmatched body lines as explicitly unknown-author entries. */
export function structureOCRLines(lines, options={}) {
  if (!Array.isArray(lines) || !lines.length) return {messages:[],headers:0,unknown:0};
  const ordered=lines.filter(l=>l && textSafe(l.text)).map(l=>({...l,text:textSafe(l.text),bbox:boxOf(l)}))
    .sort((a,b)=>a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0);
  const messages=[]; let current=null, headers=0;
  let pendingReply=[];
  function flush(){if(current){current.body=current.parts.join('\n').trim();delete current.parts;if(current.body||current.replyTo)messages.push(current);current=null;}}
  function unknown(){if(!current) current={speaker:null,time:null,date:null,replyTo:null,parts:[],uncertain:true};}
  for(let i=0;i<ordered.length;i++) {
    const line=ordered[i],txt=line.text;
    // Do not delete ambiguous lines, even if they resemble application chrome.
    const colorful = options.pixels ? coloredHeaderHint(options.pixels,options.width,options.height,line.bbox) : false;
    const header=parseSpeakerHeader(txt,{colorful});
    if(header){
      flush();
      // A pre-header '@reply' line is linked to the next header; don't drop it.
      current={...header,replyTo:pendingReply.length?pendingReply.join('\n'):null,parts:[],uncertain:!colorful};
      pendingReply=[];headers++;
      continue;
    }
    // Sometimes the model reads colored headers but garbles their time or name.
    // Split at that boundary instead of silently attaching text to the last author.
    if (colorful && /^(?:\[?(?:0?[1-9]|[1-9]\d)\]?(?:\s*\|)|\[Staff\]|Multiple\b)/i.test(txt) && txt.length<100) {
      flush();
      current={speaker:null,time:null,date:null,replyTo:pendingReply.length?pendingReply.join('\n'):null,parts:[txt],uncertain:true};
      pendingReply=[];
      continue;
    }
    const next=ordered.slice(i+1,i+3).find(l=>parseSpeakerHeader(l.text));
    if (isReply(txt) && next && (next.bbox.y0-line.bbox.y1) < Math.max(60,(line.bbox.y1-line.bbox.y0)*3.1)) {
      flush();pendingReply.push(txt);continue;
    }
    // If text appears BEFORE any header, preserve it without guessing its author.
    unknown();current.parts.push(txt);
  }
  flush();
  if(pendingReply.length) messages.push({speaker:null,time:null,date:null,replyTo:null,body:pendingReply.join('\n'),uncertain:true});
  return {messages,headers,unknown:messages.filter(m=>!m.speaker).length};
}

/** Conservative rendering; raw OCR remains the fallback and always editable. */
export function formatStructuredSegments(segments) {
  let used=0,unknown=0;
  const sections=[];
  for(const segment of segments || []) {
    const candidates=segment.messages;
    if (Array.isArray(candidates) && candidates.length && segment.structuredValid===true) {
      used++;
      for(const m of candidates) {
        if(!m?.body && !m?.replyTo)continue;
        const who=m.speaker || 'ไม่ทราบผู้พูด';
        if(!m.speaker)unknown++;
        const when=m.time || 'ไม่ทราบเวลา';
        const reply=m.replyTo?`↳ ตอบกลับ: ${m.replyTo}\n`:'';
        sections.push(`[${who}] — ${m.date?m.date+' ':''}${when}\n${reply}${m.body||'[ไม่มีข้อความ]'}`);
      }
      if(segment.hasMedia)sections.push('[ภาพแนบในแชท — ไม่ได้อ่านข้อความจากภาพแนบ]');
    } else {
      // Never fabricate structure from text-only restored sessions or failed geometry.
      const raw=textSafe(segment.text);
      if(raw){unknown++;sections.push(`[ไม่สามารถระบุผู้พูดจากภาพ ${segment.source || ''}]\n${raw}`);}
    }
  }
  return {text:sections.join('\n\n').trim(),structuredCount:used,unknownCount:unknown};
}
