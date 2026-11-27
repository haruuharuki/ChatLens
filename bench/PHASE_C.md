# ChatLens Phase C — Batch OCR comparison (2026-11-27)

- Route: `/bench/batch.html`, separate from production ChatLens.
- Input: one user-selected screenshot **stays in browser memory**; neither images nor recognized text are uploaded or persisted. CDN model and library GET requests only.
- Tesseract.js 6 `tha+eng` detects line boxes and gives the baseline output in one full-image pass.
- OpenThai 2.1 `rec.onnx` (v2.1.4), rec_dict, ONNX Runtime Web 1.22.0 WASM single-threaded. Only one ONNX session is created and reused for all selected lines; requests run sequentially to bound mobile memory.
- Initial recommended scope: 12 well-spaced probable body lines. Alternatives: all body lines or all lines, up to 60. User can stop **after current inference**.
- UI highlights grapheme differences; identical OCR is not proof of correctness. Truth text is optional per line; grapheme CER is computed on manually aligned lines only.
- Privacy-safe technical copy excludes all filenames, source text, usernames and reference strings; separate opt-in copy includes transcription.
- Error stages and failures remain explicit; **no automatic replacement with Tesseract** is ever represented as OpenThai.
- This is not complete OpenThai OCR: detection uses Tesseract, and the official OpenThai det/rec2/normalization are not ported. No production engine changes.
- Tests: pure selector, diff, privacy reports; browser smoke via stub Tesseract and stub ONNX; real Safari inference quality and memory require device acceptance.

## Acceptance

1. Open `/bench/batch.html` on iPhone Safari. Choose one Discord screenshot and start with 12 lines.
2. Observe progress and outputs. Check that all OpenThai rows are non-empty and `ONNX` ran; compare highlighted difference with original crop.
3. Add manual reference to 3–5 lines, preferably cases where engines differ; inspect compact CER for aligned text.
4. Copy the **privacy-safe technical summary** to report timing and success, or explicitly copy a transcript only if appropriate.
5. Only after representative same-image comparisons consider an opt-in model switch in production.
