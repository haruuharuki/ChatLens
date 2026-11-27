# Phase D.1 — Layout-first header recovery (experimental)

Device observation: the D.0 output for a private 1206×2622 iPhone Discord screenshot incorrectly included avatar fragments as body, malformed names, and one speaker with no name despite a visible colored header. The OpenThai line recognizer is not responsible for extracting author/time: the previous assembly used only the full-image Tesseract region text as its header input. The source screenshot and personal chat transcription remain outside the public repository.

## Changes

- Detect plausible Discord colored username bands by image geometry independently of Tesseract boxes, after the existing mobile crop. A band is a candidate **only**, not a verified username. Reject left avatar slivers and indented reply previews. A private original screenshot geometry check found 8 message-header candidate bands, excluding the indented reply line; there is no claim of transcription accuracy.
- Re-read narrow header strips separately with Tesseract. If its time is missing, use nearby original OCR only when a visible clock pattern matches. Never hallucinate time, date or author.
- Partition Tesseract header+body rectangles by their colored header band, re-read the lower white-text region separately and suppress the now-overlapped original header box from transcript export (retained in review).
- Conservative profile sliver veto for very-left high-variance image pixels. Continue to allow review and do not remove generic short messages solely because they are short.
- Recognize date separators as `date`, not generic broken fragments; keep them in the output even when omitted from the OpenThai test set.

## Limitations

This is a geometry heuristic for the *observed Discord dark mobile screenshot*. It is not a model that semantically distinguishes photographs from text; other Discord layouts can invalidate its header x-position assumptions. Tesseract can still misread targeted headers, OpenThai can still garble Thai, and a wide/tall merged region may remain unresolved. Keep the original screenshot accessible, review unknown names, and avoid production promotion until real Safari evidence improves. No Discord credentials, external OCR endpoint, or private screenshots are committed.

### D.1b isolated username pass
An opt-out checkbox controls independent header-row detection. The colored username alone is re-read with Tesseract (excluding gray role chips) and combined with a timestamp only if actually visible in header OCR. It does **not** guess missing names, override corrections or guarantee Thai OCR accuracy. Always verify results against the private screenshot on iPhone Safari before promoting beyond bench.
