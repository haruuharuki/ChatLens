# Phase C.3 — region audit before OCR (experimental only)

## Based on real iPhone feedback

- Phase C.2 detected 25 **Tesseract OCR regions**, not 25 Discord messages.
- In “all” mode, a picture attachment and avatar sliver were compared as if text.
- A box around a user name, timestamp and the following white message body cannot be graded against the whole multi-line transcription.
- One Tesseract ROI ends mid-sentence, even where there are visible characters continuing to its right.

## What changes

- Screen-pixel triage marks *high-confidence image-only* rectangular boxes for review, not automatic OCR even in “all text” mode. It never deletes them and permits user override.
- Estimate standard text-line height and detect **tall, mixed name/clock + white body** blocks; only when distinct bands are proven use the lower message-body band for fair same-region Tesseract and OpenThai benchmark. Other mixed boxes remain unchanged.
- Optional text-continuation scan expands a too-short bbox horizontally only when ink starts close to its right edge, with a bounded extension, never blindly to the screen edge. User can turn it off.
- The audit lists raw OCR-region count as such, estimated image-only count, and mixed count. Original and submitted OCR crops remain visible.

## Hard limitations

- These are conservative local image heuristics, not a semantic image classifier, full detector/rec2, or robust Discord speaker/reply grouping. All Tesseract-detected regions remain accessible in the review panel; Tesseract-undetected messages remain unknown.
- Image-only inference is intentionally uncertain: a grayscale meme with text or a strange avatar can still fool it. A tall mixed box without convincing two-band evidence will remain unmodified.
- If body OCR is benchmarked on the lower band only, the correct CER reference is **that band only**, never the header+body combined.
- Nothing changes in production. No community screenshot/username/transcript is committed to the public repo.
- Synthetic tests verify geometry, not actual iPhone/Safari accuracy.
