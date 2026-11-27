# ChatLens — Thai OCR Quality Gate (Phase 0)

This benchmark is intentionally **separate from the production scanner**. No user image, chat screenshot, quoted message, username, or manual transcription may be committed into this public repository.

## Why this exists

As of ChatLens v0.3.2, production uses Tesseract.js 6 `tha+eng`. Prior fixes improved screenshot ordering, UI masking, reaction suppression, and speaker/reply parsing, but **did not train or replace the underlying recognizer**. Unit-test success is not a measure of Thai text accuracy.

## Browser bench

Open `/ChatLens/bench/` and select a **single local screenshot**. It runs the exact current OCR language pair, with optional Tesseract PSM 6 comparison. Auto crop, bottom photo masking, and reaction masking are invoked locally as in the production scanner. The optional user-provided reference must cover the same textual region to make CER meaningful. There is no server upload, localStorage persistence, or Discord API.

The CLI/in-browser metric module uses **grapheme**-level Levenshtein distance and two CER views: literal normalized whitespace and whitespace-ignored. It normalizes Unicode NFC and the known decomposed Thai Sara Am sequence only. It does not autocorrect spelling. A CER of 0.1 means 10 edits per 100 reference graphemes; not a 90% probability of accuracy. CER can exceed 100%.

Run tests with `node --test bench/tests/*.test.mjs` or the repository workflow.

## Private acceptance corpus

Manual ground truth must be sourced from **visible screenshots** and reviewed against what is completely visible in the image. Keep it outside GitHub and public Drive. Align and score only complete regions, keeping incomplete upper/lower messages out of automatic numeric results. Record separately:

- Thai/English CER on complete, aligned message bodies
- Speaker attribution (`correct / total`), timestamp extraction, reply linkage
- Message coverage and any unhandled/cut-off text
- Wall clock time and on-device memory/thermal behavior on real iPhone Safari

Do **not** infer user or reply identity from OCR confidence alone. All comparisons should use the same source crop and reference text.

## Engine investigation and gate

Candidates for a separate prototype (NOT integrated yet):

1. **Tesseract baseline + PSM 6**: measure sensitivity, but not a new model. Controls the experiment and makes a regression baseline.
2. **OpenThai 2.1 OCR Text**: CPU-oriented compact ONNX Thai+English model. Verify model license, all preprocessing/post-processing, `rec2.onnx` and browser `onnxruntime-web` compatibility; official Python/OpenVINO accuracy does not establish Safari performance.
3. **PP-OCRv5 Thai**: mature language-specific Paddle recognition model. Current browser SDK's built-in language availability and custom-model packaging must be verified, not assumed.

Promote a new OCR engine only when it beats the baseline on the **same private images**, preserves the no-upload promise, and passes iPhone Safari speed/memory checks; require a manual feature flag and rollback to Tesseract. Do not silently switch the production engine on the strength of vendor benchmark scores.

## Explicit non-goals

No cloud OCR endpoint, no Discord user token or unauthorized scraping, no hosting other members' chat screenshots in a public repository, no auto-fixing words with guessed text, no unreviewed production OCR replacement.


## OpenThai ONNX line recognizer proof (Phase B)

Visit [`/ChatLens/bench/openthai.html`](openthai.html). Select one locally held screenshot, let Tesseract identify line boxes, choose one line, then click the OpenThai ONNX button. The experiment uses the original version-pinned `rec.onnx` and `rec_dict.txt`, and ONNX Runtime Web on `wasm` (1 thread). The user can toggle BGR/RGB and dark-text inversion as isolated diagnostic settings. If model loading, browser CORS or ONNX inference fails, an error is shown; there is **no silent fallback**. Use the exact same line as hand-verified ground truth if measuring grapheme CER.

**Important:** This is NOT a faithful port of OpenThai Text: there is no OpenThai detector, `rec2.onnx`, confidence-driven re-reads, script fixes, or faithful Python normalization. Tesseract's bounding boxes establish a fair crop for a recognizer-only probe, not a full OCR benchmark. Never use poor results as proof the official OpenThai pipeline is worse, and never claim that this test is validated on iPhone before a real Safari run. Code and models download from CDNs; screenshot pixels and text stay local.

## Phase D.0 — Character-color filter and transcript preview (experimental)

Open [batch.html](batch.html). The experimental flow can now produce an **editable transcript draft** in the form `[November 27, 2026]` followed by `[speaker] - time` and content, and copy it into ChatGPT without copying every benchmark card. The preview is available after image review (Tesseract-only) and updates with OpenThai line-recognition results. Manual exact text corrections have priority. Suspected photo-only regions are excluded, but still appear in review. Date/title and speaker/times derive from visible text only; if not verifiable, use `[ไม่ทราบวันที่]` and `[ไม่ทราบผู้พูด] - ไม่ทราบเวลา`. Reply previews stay quoted rather than inventing an author.

A reversible character-color mask keeps plausible white/gray/green/purple text pixels on *separate OCR crops*, suppressing unrelated color pixels. **It cannot perfectly separate text from images**: white stickers, captions inside images, colored graphics, missing OCR bounding boxes and clipped words remain possible. Always compare the input and processed crop, and disable text-only mask if Thai glyphs disappear. No screenshot/transcript is committed and no production `app.js` changed. All transcript messages and accuracy remain unverified on real iPhone Safari until device acceptance.


## Phase D.1 — independent header-row layout gate (2026-11-27)

The Phase D.0 device transcript lost a visible speaker and printed image scraps as text. D.1 finds username-colored horizontal bands in the uncensored *in-memory screenshot* separately from Tesseract region boxes, then re-reads each header strip. It splits Tesseract boxes covering header+body into a body-only second read. Date separators are explicitly labelled, and clipped profile-avatar strips are treated conservatively as probable graphics. These are candidate layouts, not a reliable source of names: timestamp and user-name still depend on OCR and must be checked against the screenshot.

This experimental change is only in the `/bench/batch.html` page. It does not change the main ChatLens app. A local private pixel-geometry sanity check on the reported screenshot found eight plausible username bands, excluding a more indented reply line. That does not prove OCR precision. Read [PHASE_D1.md](PHASE_D1.md) for limitations and test rationale.
