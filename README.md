# ChatLens — Discord screenshot-to-text (Mobile first)

> v0.2.2 · Static web app · https://haruuharuki.github.io/ChatLens/

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
