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
