# ChatLens — Discord screenshot-to-text (Mobile first)

> v0.3.2 · Static web app · https://haruuharuki.github.io/ChatLens/

**เป้าหมาย:** เลือกภาพแคป Discord หลายภาพบนมือถือ → อ่านข้อความ → คัดลอกไปวางใน ChatGPT โดยไม่ต้องครอปเอง

## วิธีใช้

1. เปิดเว็บใน Safari/Chrome → แท็บ **ภาพ** → เลือกภาพแชทหลายภาพพร้อมกัน
2. แอปเริ่ม OCR ไทย+อังกฤษทันที ใช้ Tesseract.js โหลดจาก CDN ผ่านอินเทอร์เน็ต และทำงานบนอุปกรณ์ผู้ใช้
3. แอปตัดแถบด้านบน/ด้านล่าง **เฉพาะภาพมือถือแนวตั้งที่มีสัดส่วนใกล้หน้าจอ** (heuristic) หากครอปผิดให้ปิดตัวเลือกก่อนเลือกภาพใหม่ หรือกด *อ่านภาพที่เลือกอีกครั้ง* หลังปิดตัวเลือก
4. แสดงข้อความรวมทันทีพร้อมปุ่ม **คัดลอกบทสนทนาไปวางใน ChatGPT**
5. หากมีคำเตือนกดตรวจเฉพาะภาพที่เสี่ยง เปิดดูข้อความดิบและภาพต้นฉบับได้ในรอบนั้น; เรียงลำดับภาพขึ้น/ลงเองได้
6. ดาวน์โหลดไฟล์ Markdown, TXT, JSON ได้จากตัวเลือกเพิ่มเติม

## ข้อจำกัดและข้อตกลง

- **OCR ไม่ใช่ข้อมูลจาก Discord API** ไม่มี token, bot, self-bot หรือ scraping ภาพต้องได้จากผู้ใช้บันทึกเอง
- **ไม่มีการรับประกันความครบหรือความถูกต้อง:** ไม่อ่านรูป/emoji ทั้งหมดได้เสมอ และคะแนน confidence ไม่ใช่เปอร์เซ็นต์ความถูกต้องของเนื้อหา
- ครอปอัตโนมัติเป็น **ประมาณตำแหน่ง UI** (crop ตามสัดส่วน) อาจตัดเนื้อหาบางกรณี โดยเฉพาะ Discord รุ่นหรือขนาดหน้าจออื่น สามารถปิดได้ก่อน OCR และอ่านภาพเดิมอีกครั้ง
- ระบบ **ไม่แอบลบข้อความที่คล้ายกัน** จะตัดข้อความซ้ำเฉพาะบรรทัดตรงกันชัดเจนและแจ้งรอยต่อที่ตรวจสอบไม่ได้
- ไม่จัดลำดับภาพโดยเดาวันที่: หากตรวจพบเวลาภาพย้อนจะเตือนให้ผู้ใช้ตรวจลำดับเอง
- บันทึก **เฉพาะข้อความ OCR และข้อมูลต้นทางแบบข้อความ** ลง localStorage บนเบราว์เซอร์เครื่องนั้นโดยอัตโนมัติ ไม่เก็บภาพต้นฉบับในฐานข้อมูล และไม่มี backend รูปตัวอย่างแสดงได้เฉพาะรอบที่ยังเปิดแท็บอยู่; ปุ่ม *ล้างทั้งหมด* ลบข้อความที่บันทึกไว้หลังเขียนเสร็จ
- **ข้อมูลไม่ส่งเข้า server ของ ChatLens** แต่ Tesseract.js และโมเดล/ไฟล์ภาษาต้องโหลดจาก CDN ครั้งแรก และไม่มีการรับประกันการทำงานออฟไลน์
- บราว์เซอร์ Private Mode, การล้าง Site Data หรือ Storage quota อาจทำให้ข้อความที่เก็บไว้หายได้ ควรกดคัดลอก/ดาวน์โหลดเมื่อข้อมูลสำคัญ
- **Video to Chat** ยังเป็นโหมดทดลอง 48 เฟรมสูงสุด/ครั้ง โดยไฟล์ MOV/HEVC บางแบบอ่านไม่ได้บนมือถือ
- ควรเคารพกฎของคอมมูและสิทธิส่วนบุคคลของสมาชิก อย่าใส่ภาพแชทจริงลง Repository สาธารณะ

## Source and development

- `index.html`, `styles.css` — mobile-first UI + output-first copy
- `app.js` — OCR, local text restore, review, copy/export
- `lib/merge.mjs` — conservative overlap and export
- `lib/scan-utils.mjs` — mobile crop/optional timeline warning
- `tests/*.test.mjs` — baseline + safety tests, run `node --test tests/*.test.mjs`
- `.github/workflows/check.yml` — Node tests and JavaScript syntax check on GitHub Actions

Live site deploys from `main` via GitHub Pages. No build step.

**V0.2 validation note:** Unit tests and Chrome desktop browser smoke tests do not prove real OCR accuracy or iPhone Safari behavior. Real mobile screenshots remain an acceptance gate.

## v0.2.1 OCR diagnostic (2026-11-26)

Tested visually against three user-provided Discord iPhone screenshots (1206 x 2622). Real screenshots are **not stored in this public repository**. The app was recognizing the whole cropped chat as one block, including embedded photo areas and colorful mention chips. Comparison of a single grayscale/contrast trial with baseline Tesseract did **not** eliminate Thai word/vowel errors. The new preprocessing remains a conservative experiment, not an accuracy guarantee.

- Crop now suppresses avatars at the left and more of the bottom composer, while retaining the first visible speaker line. The crop is still heuristic for iPhone portrait Discord dark mode. Disable it if it clips text on other devices.
- A private, original-resolution screenshot remains visible in the **current session** for manual verification; only text is persisted on-device.
- Improve local Thai OCR with a browser-suitable Thai recognizer before claiming production-grade extraction. PaddleOCR th-rec and iApp OpenThai OCR are candidates requiring actual iPhone Safari/WASM + privacy and model licensing checks.
- A detected photo is not a transcribed photo caption. Do not infer details of attachments from image OCR garbage.

## v0.2.2 · Real screenshot follow-up

Four user supplied iPhone Discord screenshots (IMG_6768–6771) showed two separate failures: OCR Thai glyph confusion persists (Tesseract), and the image picker delivered the captures out of chronological order. No private screenshots enter the public repository.

- Automatically sort **only** iOS `IMG_<number>` screenshots, including the previously restored image-only session, preserving a manual reorder and all unrecognized filename batches unchanged. File number is an ordering *hint*, not proof of chat completeness.
- Suppress OCR over a **high-confidence large light photo that continues to the bottom** of an otherwise dark screenshot. Replace it with `[ภาพแนบในแชท — ไม่ได้ถอดรายละเอียดจากรูปภาพ]`; source remains visible in review. All uncertain or embedded/fully-contained media still require review.
- Normalize only decomposed Thai sara-am Unicode, without guessing or rewriting misspelled Thai words.
- Disable mandatory dark contrast as it failed to resolve the actual Thai vowel errors on the user's samples.
- The Thai engine upgrade is a separate task: OpenThai 2.1 Text ONNX (Apache-2.0) supports Thai and English but its full browser runtime / Safari compatibility must be proved before replacing existing OCR. Do not claim the current release solves Thai accuracy.


## v0.3 · Visual capture overlap (2026-11-26)

- User-provided IMG_6799 PNG → IMG_6800 JPEG → IMG_6801 PNG shows substantial screenshot overlap, while Thai OCR strings differ and exact-line merge cannot detect it.
- Before OCR, screenshot thumbnails (360 px wide, in-memory only) are compared for high-confidence vertical pixel alignment; if both independent regions match, the next image is cropped to **mostly new content**, preserving two lines of safety overlap.
- Resolutions can differ as long as aspect ratio agrees after normalization (tested 1206×2622 and 706×1536).
- **Off by choice:** disable the checkbox and select the same screenshots again to re-read the full captured area.
- Visual overlap works for consecutive images in the *same selected batch*; it cannot compare against images from a restored text-only session. A screenshot with no confident match is left untouched.
- This solves neither incorrect Thai spelling nor the problem of chat sections that were never captured. Any screenshot/image still stays on the user's device, is not committed, and is not uploaded to GitHub/Drive.


## v0.3 — Discord-aware OCR structure (experimental)

- OCR output now requests Tesseract.js v6 `blocks: true` and reconstructs bounding-box lines locally.
- Header parser looks for Discord time at line end and plausible speaker name, with colored-name pixels as an *advisory hint*. Text between two headers is grouped as message body; replies beginning with `@` immediately before a header can be attached as `replyTo`.
- Copy mode defaults to `[ผู้พูด] — เวลา` + body. A dropdown instantly switches to original raw OCR. If line boxes or trusted headers are unavailable, **never fabricate a speaker**: show clearly labeled unstructured raw text.
- Editing the raw OCR invalidates the old structured parse, preventing silently stale output. Re-import images to re-run structure extraction.
- Per-image entries are stored in browser-local text storage alongside the original OCR string; image bytes stay ephemeral in device memory. Existing sessions are restored in raw fallback.
- This is **not model training** or guaranteed Thai OCR accuracy, and does not fetch actual Discord messages. A local browser smoke test was blocked by environment network policy. Manual iPhone Safari validation remains necessary before claiming production readiness.

## v0.3.1 — Discord reply preview above a message (experimental)

Discord mobile renders a reply as a short, muted **preview above the replying sender's header**, often preceded by a small profile picture and hooked line on the left. A preview can wrap across two or more lines. It is **not** an independent chat message.

- The structured OCR parser now groups up to 4 contiguous reply-preview lines **only when** a leading `@handle` (or an explicit reply marker), screenshot line geometry, and the immediately following speaker+time header agree.
- Output puts `> ตอบกลับ: [ผู้ใช้ต้นทาง] — ข้อความที่อ้างถึง…` *before* `[ผู้ตอบ] — เวลา` and the new reply body. This is a best-effort rendering, not a message fetched from Discord.
- Plain `@mentions` inside ordinary messages are not classified as replies merely because an `@` appears. Low-confidence/partial previews remain in the text and uncertain authors are not invented. Complex mentions are kept verbatim rather than guessing an author.
- The detection uses text-line position and indentation. It does **not** recognize the bent reply-connector line directly, and can miss replies if OCR mangles the `@` symbol or screenshots cut off part of the preview.
- Raw OCR switch, copy/export, local-only storage and privacy remain unchanged. No real user screenshots or community chat content are committed to the public repo.
- Tests use only synthetic examples based on the geometry of a private uploaded screenshot. iPhone Safari and real Thai OCR quality remain manual acceptance checks.

## v0.3.2 — Ignore reaction UI in Discord dark mode (experimental)

- React pills (emoji+count and the adjacent add-reaction button) sit **below** message content and are not part of a user's message. Mask **only rows of two or more** adjacent, recognizably colored UI chips in a disposable OCR canvas before recognition.
- Preserve emoji, Unicode symbols and mentions inside actual message text; preserve reply preview and original screenshot review. An isolated ambiguous pill is deliberately **not masked** to avoid deleting user content.
- Current detector is limited to the observed dark Discord theme; different themes, screens and compressed formats might not match. No blanket removal of emoji or numbers.
- Tests use synthetic pill layouts. Private sample screenshot bytes are tested only in local diagnostics, not committed. OCR accuracy on iPhone Safari requires hands-on validation.
