# Phase D.0 — Discord character color mask and structured transcript preview

## Motivation from device evidence (2026-11-27)
- Screenshot `private phone screenshot` from private iPhone use shows 25 Tesseract regions, not 25 actual Discord messages. C.3 photo-only heuristics can flag some avatars, but many header+content boxes still confuse recognizers.
- Desired export is `[date]`, `[user] - time`, `body`; no avatar, attachments, roles-as-badges or reaction counters in chat content.
- The previous UI required scrolling many per-line benchmark cards. User wants one editable copy-ready result.

## Implementation (experiment in `/bench` only)
- `text-color-mask.mjs`: optional color-pixel filtering (white, gray, Discord green/blue/purple) on disposable OCR crops. Exact same pixels go to both recognizers. This is **not** semantic character detection and cannot guarantee removal of images.
- `text-transcript.mjs`: order detected OCR regions by screen location, read an explicit visible date separator, parse speaker+time only when evidence supports it, attach subsequent body lines, omit confidently flagged graphics, keep replies as notes. Unknown dates or speaker are marked unknown, never guessed. Prefers hand-corrected text to OCR when supplied.
- `batch.html`: an editable transcript preview after Tesseract review and OpenThai completion; one-click copy; advanced per-line comparisons collapsed by default.
- Date, headers, reply content and inline visual attachments can still be missed; a Tesseract box is not guaranteed to be one word, one visual line or one Discord message.

## Testing and privacy
- Tests include synthetic date validation, multi-line grouping, speaker/date unknown fallback, short speech, mixed header+body and image-only veto, text-color mask and opt-out.
- Node tests are *not* proof of accuracy on the user's real screenshot. Original screenshot remains on device; no Discord authentication, token, HTTP OCR endpoint, or private chat fixtures committed.
- The dedicated `/bench` proof never updates the production `index.html` and `app.js`.
