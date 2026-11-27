# ChatLens Phase C.1 — conservative body-text benchmark

Issue: line boxes returned by Tesseract can include a tiny slice of a green Discord username, a reply preview, avatar artwork or an inline emoji. Comparing such a crop with a reference that describes `(โปรไฟล์)` or `(อิโมจิ)` yields misleading CER values. The model may read Thai accurately yet the REGION is incorrect.

This update changes ONLY the isolated `/bench/batch.html`, **not** the production chat exporter. It has three independent safeguards:

1. Lines receive an approximate label: `body`, `header`, `reply` or `fragment`. Default body sampling excludes detected headers/replies/fragments. The `all` mode still includes all rows, with their labels, for manual debugging. The classifier can make mistakes; this is not a full Discord layout detector.
2. New default-on, reversible `focus-body` checkbox cleans a **copy** of probable body rows: hides strongly saturated pixels (commonly emoji, avatar and green header), conservatively guards the remaining far-left avatar sliver only after mobile auto-crop, and limits unusually tall mixed OCR boxes to the dominant white text band when there is clear evidence. Raw original is always displayed.
3. In focused mode, Tesseract and OpenThai both read **the same cleaned canvas**. Tesseract's original full-image recognition is retained for initial detection only. The page shows the actual submitted image, extra Tesseract re-read time, and line-type hints. This is an apples-to-apples line recognizer experiment, NOT an automatic fix to the main transcript.

Do not use explanatory placeholders as literal CER ground truth. If emoji is excluded from the cleaned ROI, transcribe only the visible text from the cleaned ROI. A lower CER only applies to that aligned text region, not the speaker, reply attribution, completeness, or user image.

Privacy: no real screenshot, user names, or chat text are stored in repository, in Drive, or uploaded to an OCR server. Tests use synthetic examples and pixels only.

Acceptance on iPhone: retry a screenshot with green Discord usernames, reply preview and inline emoji, confirm the default sample excludes headers and reply preview, confirm cleaned ROI still includes the WHOLE Thai body text, compare two models, switch `focus-body` off if the filter hides meaningful content. Do not claim perfection from unit tests; the actual iPhone rendering/OCR must be checked.
