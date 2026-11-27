# ChatLens Phase C.2 — layout-aware region proof + omission audit

This is an **isolated research UI** at `/bench/batch.html`, not the regular ChatLens chat exporter.
It uses **Tesseract for line detection** and **OpenThai 2.1 `rec.onnx`** for recognition.
It does not implement the full OpenThai detector, `rec2`, semantic Discord message grouping, or reliable emoji detection.

## What changes

1. The experiment can estimate the screenshot's common **message text column** from multiple OCR line boxes. If a candidate line box starts *far* to its left, it dark-masks the suspected avatar strip in a **copy** of the line bitmap. This operation requires sufficient examples; otherwise it is disabled for safety.
2. A geometry-aware detector optionally masks a **large bright or highly colored patch at the far right** of a body line. This targets inline white-square and saturated emoji artifacts missed by the old saturation-only filter. It only acts if a window of approximately a character height is very densely filled with image-like color. It may miss tiny or grayscale stickers, and can mistakenly hide legitimate inline artwork; both original and processed crops are displayed.
3. Clicking **ตรวจทั้งภาพ / เลือกข้อความสั้นที่ระบบข้าม** scans the screenshot and reveals the classifier's **ALL detected rows** (up to 120 visual previews; selected benchmark limit 60), including probable header, Reply, and short/fragment rows. Selected rows remain editable. This is important because a short speech line is still part of the conversation; *not selected for accuracy benchmark* MUST NEVER mean *discard from chat export*.
4. The optional CER reference field rejects parenthetical descriptions of graphics such as `(อิโมจิที่ถูกลบไม่หมด)` or `(โปรไฟล์)` as non-aligned references; it shows a warning and does not average that row. Enter only literal characters of the OCR image ROI.

## Safety and validation

- Changes are limited to `/bench/*`, not production `index.html` or `app.js`.
- No real community screenshot, message content, or account name is committed. Pixels/text stay on device; runtime and model JavaScript are requested from CDNs/Hugging Face.
- Geometric cleanup is enabled only while **โฟกัสเฉพาะข้อความเนื้อหา** is checked, and can be turned off independently with **ทดลองแยกคอลัมน์เนื้อหา...**. The preview ALWAYS shows the original crop and the actual processed crop.
- Synthetic unit tests verify masking, fallback, false-positive avoidance and review UI wiring. They do **not** establish real Thai OCR accuracy on iPhone Safari. Browser smoke may be blocked by local security policy.
- Treat 25 detected / 8 selected as an *audit issue*, not 17 messages dropped; a Tesseract-undetected line cannot appear in the review. Full document completeness must be assessed separately.

## Suggested acceptance

On iPhone Safari, scan the same screenshot. Inspect (a) an avatar-contaminated short row, (b) a white-square emoji and (c) a colored emoji, with both cleanup options on and off. Confirm each legitimate Thai glyph is still present and compare actual OCR. Open the review panel and inspect all previously omitted rows; manually add a real short utterance. Use literal-text reference strings, then compare CER and end-to-end latency. Do not switch the main ChatLens engine without those checks.
