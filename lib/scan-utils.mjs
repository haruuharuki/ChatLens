/** Screenshot-only helpers. Never infer missing messages from screenshots. */
export function discordCropRect(width, height, enabled = true) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('Invalid source dimensions');
  const aspect = height / width;
  // Only tall mobile screenshots: do not crop desktop screenshots or arbitrary photos.
  if (!enabled || aspect < 1.45 || aspect > 3.2 || height < 700) {
    return { x: 0, y: 0, width, height, cropped: false };
  }
  // Measured on real 1206x2622 iPhone Discord screenshots (Nov 26, 2026).
  // Leave space for message text near the top, and exclude the floating composer.
  // Trim avatars at left; chat text starts farther right. This is a heuristic.
  const left = Math.round(width * 0.095);
  const top = Math.round(height * 0.133);
  const bottom = Math.round(height * 0.112);
  return { x: left, y: top, width: width - left, height: height - top - bottom, cropped: true };
}

/** Time is advisory only: OCR may corrupt timestamps, and screenshots can start mid-message. */
export function firstDiscordTimestamp(text) {
  const match = String(text || '').match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{2}|\d{4})\s*,?\s*(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)\b/i);
  if (!match) return null;
  const [,month,day,year,hour,minute,period] = match;
  const yyyy = Number(year) < 100 ? 2000 + Number(year) : Number(year);
  const h = Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0);
  const d = new Date(Date.UTC(yyyy, Number(month)-1, Number(day), h, Number(minute)));
  // Reject dates that silently overflow (e.g., February 31).
  if (d.getUTCMonth() !== Number(month)-1 || d.getUTCDate() !== Number(day)) return null;
  return d.getTime();
}

export function checkSegmentsForReview(segments) {
  const issues = [];
  let lastTime = null;
  segments.forEach((item, index) => {
    const text = String(item.text || '').trim();
    if (!text) issues.push({index, type:'empty', detail:'ภาพนี้ไม่มีข้อความที่อ่านได้'});
    else if (text.length < 24 && item.kind !== 'text') issues.push({index, type:'short', detail:'อ่านข้อความได้สั้นมาก อาจพลาดเนื้อหา'});
    if (Number.isFinite(item.confidence) && item.confidence < 72) {
      issues.push({index, type:'ocr', detail:'คะแนน OCR ต่ำ ควรเทียบภาพต้นฉบับ'});
    }
    if (/(?:\b\d{1,3}\s*Online\b|(?:^|\n)\s*#\s*[\w-]+\s*(?:>|$))/i.test(text)) {
      issues.push({index, type:'ui', detail:'อาจมีแถบ UI ของ Discord ปะปนในข้อความ'});
    }
    const ts = firstDiscordTimestamp(text);
    if (ts !== null && lastTime !== null && ts < lastTime) {
      issues.push({index, type:'order', detail:'เวลาในภาพนี้ย้อนกลับจากภาพก่อนหน้า ลองตรวจลำดับภาพ'});
    }
    if (ts !== null) lastTime = ts;
    if (item.hasMedia) issues.push({index,type:'media',detail:'ตรวจพบภาพแนบที่ถูกข้ามไว้ เพื่อไม่สร้างอักษรมั่วจากรูปภาพ'});
    if (item.error) issues.push({index,type:'error',detail:'เปิดภาพ/อ่านเฟรมไม่สำเร็จ'});
  });
  return issues;
}
