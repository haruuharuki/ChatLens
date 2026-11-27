# OCR milestone plan — ChatLens

**Status:** Baseline and scoring infrastructure ready. Thai recognition engine replacement NOT yet implemented.

**Problem:** Text from iPhone Discord captures is corrupted at the **recognition stage**, even when chat structure is reconstructed. Example error types: tone marks, Thai Sara Am, speaker glyphs, emoji/icon fragments, and reply previews. Prior tests mostly covered heuristics.

## Phase A — evidence (started)
- Ground-truth selected complete lines from actual screenshots in a PRIVATE local folder; image bytes / transcripts do not leave the working environment.
- Calculate per-region grapheme CER using source/recognized **aligned** text. Keep attribution/reply accuracy separate.
- Create a privacy-safe browser bench on `/ChatLens/bench/` that runs the same Tesseract configuration and optional PSM 6; no model promises.

## Phase B — alternative engine proof (recognizer-only browser probe implemented; full pipeline not implemented)
- Implement OpenThai 2.1 Text via ONNX Runtime in a scratch prototype; inspect official `rec2` second recognizer and dictionary/runtime glue, not only `rec.onnx`.
- Compare identical crops with PaddleOCR Thai as fallback, including English, name tags, and mixed Thai/Latin lines.
- Measure a meaningful sample (at least several screenshots and all major UI patterns), and track dropped/duplicated messages and replies.

## Phase C — mobile acceptance gate
- Test locally in actual iPhone Safari: loading, CPU time, memory exhaustion, download/model cache, battery, and mixed-script names.
- Expose opt-in engine selector only after tests, keep Tesseract fallback, no new uploads.

**Do not call any of this 'trained' until a model is actually trained.**


### Phase B current implementation notes
- `/bench/openthai.html` launches version-pinned OpenThai 2.1.4 rec-only ONNX browser inference on a user-selected line; line geometry is discovered with Tesseract. It cannot be considered an official OpenThai pipeline.
- Pending validation: real Safari on iPhone, network/CORS access to Hugging Face, ONNX ops/shape compatibility, benchmark performance with hand-corrected per-line ground truth.
- Future implementation: independently implement proper OpenThai detection and Python Thai normalisation, rec2, and full reading order; then compare whole screenshot against whole screenshot.
- If any browser prerequisite fails, document it and consider a separate well-supported browser PP-OCRv5 Thai SDK candidate; never silently send images to a third-party API.
