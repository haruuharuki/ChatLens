/**
 * Conservative adjacent-frame overlap detection.
 * This is NOT a guarantee that the recording captured the whole conversation.
 */
export function normalizeLine(line) {
  return String(line).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function linesOf(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map(x => x.trim()).filter(Boolean);
}

export function detectOverlap(previous, next) {
  const a = linesOf(previous);
  const b = linesOf(next);
  // A repeated short message on its own should never be silently deleted.
  const max = Math.min(a.length, b.length, 40);
  for (let n = max; n >= 2; n--) {
    const left = a.slice(-n).map(normalizeLine);
    const right = b.slice(0, n).map(normalizeLine);
    const totalChars = left.join('').length;
    if (totalChars < 20) continue;
    if (left.every((line, i) => line === right[i])) return n;
  }
  return 0;
}

export function mergeSegments(segments) {
  const items = segments.map((s, i) => ({ ...s, position: i + 1 }));
  const notices = [];
  let text = '';
  let lastText = '';
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    const raw = String(s.text || '').trim();
    if (!raw) {
      notices.push({ index: i, type: 'empty', message: `ช่วง ${i + 1}: ไม่มีข้อความที่อ่านได้` });
      continue;
    }
    if (!lastText) {
      text += raw;
      lastText = raw;
      continue;
    }
    const count = detectOverlap(lastText, raw);
    if (count) {
      const rest = linesOf(raw).slice(count).join('\n');
      if (rest) text += `\n${rest}`;
      notices.push({ index: i, type: 'overlap', message: `ช่วง ${i + 1}: ตัดข้อความที่ทับซ้อน ${count} บรรทัด` });
    } else {
      const boundary = `[ตรวจสอบรอยต่อ: ช่วง ${i} → ${i + 1} ไม่พบข้อความซ้ำที่ยืนยันความต่อเนื่อง]`;
      text += `\n\n${boundary}\n${raw}`;
      notices.push({ index: i, type: 'uncertain', message: boundary });
    }
    // Compare to the previous *captured* frame rather than growing merged text.
    lastText = raw;
  }
  return { text: text.trim(), notices };
}

export function splitText(text, maxChars = 8000) {
  const cap = Math.max(400, Math.floor(maxChars));
  const lines = String(text || '').split('\n');
  const parts = [];
  let current = '';
  for (const line of lines) {
    if (line.length > cap) {
      if (current) { parts.push(current.trimEnd()); current = ''; }
      for (let i = 0; i < line.length; i += cap) parts.push(line.slice(i, i + cap));
      continue;
    }
    const added = (current ? '\n' : '') + line;
    if (current && current.length + added.length > cap) {
      parts.push(current.trimEnd());
      current = line;
    } else current += added;
  }
  if (current) parts.push(current.trimEnd());
  return parts;
}

export function exportMarkdown(segments, title = 'Discord Story Archive') {
  const { text, notices } = mergeSegments(segments);
  const uncertain = notices.filter(n => n.type === 'uncertain' || n.type === 'empty').length;
  return `# ${title}\n\n> บันทึกจากไฟล์ที่ผู้ใช้จัดเตรียมเอง ไม่ใช่ประวัติจาก Discord API\n> จำนวนช่วง: ${segments.length} | รอยต่อที่ยังไม่ยืนยัน: ${uncertain}\n> ข้อควรระวัง: OCR อาจอ่านข้อความผิด และการไม่พบข้อความซ้ำไม่ได้พิสูจน์ว่ามีข้อความตกหล่น\n\n## บทสนทนา\n\n${text}\n\n## ที่มาของข้อมูล\n\n${segments.map((s,i) => `- ${i+1}. ${s.source || 'ข้อความวาง'}${Number.isFinite(s.second) ? ` @ ${s.second.toFixed(1)} วินาที` : ''}${s.confidence != null ? ` (OCR ${Math.round(s.confidence)}%)` : ''}`).join('\n')}\n`;
}
