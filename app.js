import { mergeSegments, splitText, exportMarkdown } from './lib/merge.mjs';
import { discordCropRect, checkSegmentsForReview } from './lib/scan-utils.mjs';
import { prepareDarkChatForOCR } from './lib/ocr-preprocess.mjs';

const $ = id => document.getElementById(id);
const segments = [];
let busy = false;
let worker = null;
const OCR_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
const MAX_VIDEO_FRAMES = 48;
const STORAGE_KEY = 'chatlens-session-v02';
const previews = new Map(); // object URLs last only while this page stays open
let saveTimer = null;
let storageError = false;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    try {
      const items=segments.map(({id,text,source,kind,confidence,second,error,fingerprint,enhanced})=>({id,text,source,kind,confidence,second,error,fingerprint,enhanced}));
      const value=JSON.stringify({version:2,title:$('archive-title').value,segments:items});
      if(value.length>2500000) throw new Error('ข้อมูลมีขนาดใหญ่เกินสำหรับบันทึกในเบราว์เซอร์');
      localStorage.setItem(STORAGE_KEY,value);
      storageError=false;
      $('save-state').textContent='✓ บันทึกข้อความล่าสุดในเบราว์เซอร์เครื่องนี้แล้ว (ไม่บันทึกรูป)';
    } catch(err){
      storageError=true;
      $('save-state').textContent='⚠️ บันทึกอัตโนมัติไม่ได้ กรุณากดคัดลอกหรือดาวน์โหลดก่อนปิดเว็บ';
    }
  },300);
}
function loadSession(){
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(saved?.version!==2 || !Array.isArray(saved.segments))return;
    for(const item of saved.segments.slice(0,800)){
      if(typeof item.text!=='string'||typeof item.source!=='string')continue;
      segments.push({
        id: typeof item.id==='string'?item.id:String(Date.now()+Math.random()),
        text:item.text.slice(0,250000),source:item.source.slice(0,180),
        kind:typeof item.kind==='string'?item.kind:'image',
        confidence:Number.isFinite(item.confidence)?item.confidence:undefined,
        second:Number.isFinite(item.second)?item.second:undefined,
        error:typeof item.error==='string'?item.error:undefined,
        fingerprint:typeof item.fingerprint==='string'?item.fingerprint:undefined,
        enhanced:item.enhanced===true
      });
    }
    if(typeof saved.title==='string')$('archive-title').value=saved.title.slice(0,100);
    if(segments.length)message(`กู้คืนข้อความที่เคยอ่านไว้ ${segments.length} ช่วง (รูปต้นฉบับไม่ได้เก็บไว้)`);
  }catch(_){$('save-state').textContent='ไม่สามารถเปิดบันทึกเดิมได้';}
}

function message(value) { $('file-summary').textContent = value; }
function status(label, percent = 0) {
  $('progress-box').hidden = false;
  $('status-label').textContent = label;
  $('progress-number').textContent = `${Math.round(percent)}%`;
  $('progress-bar').style.width = `${Math.min(100, Math.max(0, percent))}%`;
}
function setBusy(state) {
  busy = state;
  for (const id of ['start-image','start-video','add-text','clear-all','demo','image-input','video-input','auto-crop']) $(id).disabled = state;
  if (!state) $('progress-box').hidden = true;
}
function tabs(active) {
  for (const name of ['image','video','text']) {
    const chosen = name === active;
    $(`panel-${name}`).hidden = !chosen;
    $(`tab-${name}`).classList.toggle('active',chosen);
    $(`tab-${name}`).setAttribute('aria-selected',String(chosen));
  }
}
for (const name of ['image','video','text']) $('tab-'+name).addEventListener('click',()=>tabs(name));

const refreshFileMessage = (input) => {
  const names = Array.from(input.files || []).map(f=>f.name);
  message(names.length ? `${names.length} ไฟล์ที่เลือก: ${names.slice(0,3).join(', ')}${names.length>3?'…':''}` : 'ยังไม่มีไฟล์ที่เลือก');
};
$('image-input').addEventListener('change',() => { refreshFileMessage($('image-input')); void scanSelectedImages(); });
$('video-input').addEventListener('change',() => refreshFileMessage($('video-input')));

function addSegment(text, source, extra={}) {
  const item={id:crypto.randomUUID?.() || String(Date.now()+Math.random()), text:String(text||'').trim(), source, ...extra};
  segments.push(item); return item;
}
function sanitizeTitle(t) { return (t || 'chatlens').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0,70) || 'chatlens'; }
function render() {
  const list = $('review-list'); list.replaceChildren();
  $('empty-state').hidden = segments.length > 0;
  $('review-details').hidden = segments.length === 0;
  for (let i=0; i<segments.length; i++) {
    const s=segments[i];
    const item=document.createElement('article'); item.className='review-item'; item.id='review-'+s.id;
    const header=document.createElement('div'); header.className='review-head';
    const desc=document.createElement('div');
    const name=document.createElement('div'); name.className='review-name'; name.textContent=`${i+1}. ${s.source}`;
    const meta=document.createElement('div'); meta.className='review-meta';
    meta.textContent=`${Number.isFinite(s.second)?`${s.second.toFixed(1)} วินาที · `:''}${s.confidence != null?`คะแนนโมเดล OCR ${Math.round(s.confidence)}% (ไม่ใช่ความแม่นยำ) · `:''}${s.text.length.toLocaleString('th-TH')} ตัวอักษร`;
    desc.append(name,meta);
    const actions=document.createElement('div'); actions.className='mini-actions';
    for (const [symbol,label,fn,disabled] of [
      ['↑','เลื่อนขึ้น',()=>move(i,-1),i===0],
      ['↓','เลื่อนลง',()=>move(i,1),i===segments.length-1],
      ['×','ลบช่วงนี้',()=>{const gone=segments.splice(i,1)[0];if(previews.has(gone.id)){URL.revokeObjectURL(previews.get(gone.id));previews.delete(gone.id);}render();},false]
    ]) {
      const btn=document.createElement('button'); btn.type='button';btn.className='icon-button';btn.textContent=symbol;btn.title=label;btn.setAttribute('aria-label',label);btn.disabled=disabled||busy;btn.addEventListener('click',fn);actions.append(btn);
    }
    header.append(desc,actions);
    const editor=document.createElement('textarea');editor.value=s.text;editor.setAttribute('aria-label',`แก้ไขข้อความช่วงที่ ${i+1}`);editor.spellcheck=false;
    editor.addEventListener('input',()=>{s.text=editor.value;meta.textContent=`${Number.isFinite(s.second)?`${s.second.toFixed(1)} วินาที · `:''}${s.confidence!=null?`คะแนนโมเดล OCR ${Math.round(s.confidence)}% · `:''}${s.text.length.toLocaleString('th-TH')} ตัวอักษร`;refreshStats();});
    item.append(header,editor);
    if(previews.has(s.id)){
      const previewBtn=document.createElement('button');previewBtn.className='text-button';previewBtn.type='button';previewBtn.textContent='ดูภาพต้นฉบับ';
      const previewImg=document.createElement('img');previewImg.className='source-preview';previewImg.alt='ภาพต้นฉบับ '+s.source;previewImg.hidden=true;
      previewBtn.addEventListener('click',()=>{previewImg.hidden=!previewImg.hidden;if(!previewImg.hidden)previewImg.src=previews.get(s.id);});
      item.append(previewBtn,previewImg);
    }
    list.append(item);
  }
  refreshStats();
}
function move(i,delta){ const j=i+delta;if(j<0||j>=segments.length)return;[segments[i],segments[j]]=[segments[j],segments[i]];render();}
function refreshStats(){
  const {text,notices}=mergeSegments(segments);
  const issues=checkSegmentsForReview(segments);
  const uncertain=notices.filter(n=>n.type!=='overlap').length;
  const overlap=notices.filter(n=>n.type==='overlap').length;
  $('export-stats').textContent=`${segments.length} ช่วง · ${text.length.toLocaleString('th-TH')} ตัวอักษร`;
  $('merged-preview').value=text;
  $('merge-summary').textContent=segments.length
    ? `พบข้อความซ้ำที่ตัดได้แน่ชัด ${overlap} จุด · รอยต่อยังไม่ยืนยัน ${uncertain} จุด${issues.length?' · มีจุดควรตรวจ '+issues.length+' จุด':''}
ข้อความยังอยู่ครบตาม OCR ไม่ลบส่วนที่คล้ายกันโดยคาดเดา`
    : 'เพิ่มภาพเพื่อดูข้อความทั้งหมดและจุดที่ควรตรวจ';
  const alerts=$('review-alerts');alerts.replaceChildren();
  if(segments.length){
    const one=document.createElement('p');one.className='hint';
    one.textContent=issues.length||uncertain ? `พบ ${issues.length} ข้อสังเกตในภาพ และ ${uncertain} รอยต่อที่ยังยืนยันไม่ได้ — กดคัดลอกได้เลย แต่ควรดูส่วนที่สำคัญ` : 'ยังไม่พบจุดผิดปกติจากกฎเบื้องต้น (ไม่รับประกันว่า OCR อ่านถูกทุกคำ)';
    alerts.append(one);
    issues.slice(0,12).forEach(issue=>{
      const b=document.createElement('button'); b.className='review-warning';b.type='button';
      b.textContent=`ภาพ ${issue.index+1}: ${issue.detail} · แตะเพื่อตรวจ`;
      b.addEventListener('click',()=>{
        $('review-details').open=true;
        const item=segments[issue.index];
        document.getElementById('review-'+item?.id)?.scrollIntoView({behavior:'smooth',block:'center'});
      });alerts.append(b);
    });
    if(issues.length>12){const tail=document.createElement('p');tail.className='hint';tail.textContent=`และอีก ${issues.length-12} จุด ดูรายละเอียดโดยเปิดรายการด้านล่าง`;alerts.append(tail);}
  }
  for(const id of ['export-md','export-txt','export-json','copy-text']) $(id).disabled=segments.length===0||busy;
  scheduleSave();
}

function loadScript(src){
  return new Promise((resolve,reject)=>{
    if(window.Tesseract)return resolve();
    const s=document.createElement('script');s.src=src;s.async=true;s.crossOrigin='anonymous';
    s.onload=()=>window.Tesseract?resolve():reject(new Error('OCR โหลดไม่สมบูรณ์'));
    s.onerror=()=>reject(new Error('โหลด OCR ไม่ได้ กรุณาเชื่อมอินเทอร์เน็ตหรือปิดตัวบล็อก CDN แล้วลองใหม่'));
    document.head.append(s);
  });
}
async function ensureWorker(){
  if(worker)return worker;
  status('กำลังโหลดตัวอ่านภาษาไทยและอังกฤษ...', 3);
  await loadScript(OCR_URL);
  worker=await window.Tesseract.createWorker('tha+eng',1,{logger(m){ if(m.status==='recognizing text') $('status-label').textContent='กำลังอ่านข้อความด้วย OCR...'; }});
  return worker;
}
function reducedCanvas(width,height,maxWidth=1800){
  const scale=Math.min(1,maxWidth/width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  return canvas;
}
async function readImageFile(file){
  let url=URL.createObjectURL(file);
  try {
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('เบราว์เซอร์เปิดภาพนี้ไม่ได้'));img.src=url;});
    const crop=discordCropRect(img.naturalWidth,img.naturalHeight,$('auto-crop').checked);
    const canvas=reducedCanvas(crop.width,crop.height);
    canvas.getContext('2d').drawImage(img,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
    // Contrast on a disposable OCR canvas only; preserve original preview.
    let enhanced=false;
    if(crop.cropped){
      try{enhanced=prepareDarkChatForOCR(canvas);}
      catch(_err){/* Low-memory Safari can reject pixel reads; use original crop instead. */}
    }
    const result=await worker.recognize(canvas);
    return {text:result.data.text,confidence:result.data.confidence,enhanced};
  } finally { URL.revokeObjectURL(url); }
}
function waitForMedia(video,event,timeout=10000){
  return new Promise((resolve,reject)=>{
    let timer;
    function done(){clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);}
    function ok(){done();resolve();}
    function bad(){done();reject(new Error('เบราว์เซอร์เปิดวิดีโอนี้ไม่ได้ หรือ codec ไม่รองรับ'));}
    video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});
    timer=setTimeout(()=>{done();reject(new Error(`รอข้อมูลวิดีโอเกิน ${timeout/1000} วินาที`));},timeout);
  });
}
async function prepareVideo(file){
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';
  const url=URL.createObjectURL(file);
  const load=waitForMedia(video,'loadedmetadata',15000);
  video.src=url;video.load();
  try {await load; if(!Number.isFinite(video.duration)||video.duration<=0)throw new Error('ไม่สามารถอ่านความยาววิดีโอได้');return {video,url};}
  catch(error){URL.revokeObjectURL(url);video.removeAttribute('src');video.load();throw error;}
}
async function seekAndCapture(video, second){
  const target=Math.min(Math.max(0.05,second),Math.max(0.05,video.duration-0.05));
  if(Math.abs(video.currentTime-target)>.01 || video.readyState<2){
    const sought=waitForMedia(video,'seeked',12000);
    video.currentTime=target;
    await sought;
  }
  if(video.readyState<2)await waitForMedia(video,'loadeddata',12000);
  // Allow Safari/Android a paint cycle after seeking to avoid stale frames.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const canvas=reducedCanvas(video.videoWidth,video.videoHeight,1600);
  if(canvas.width<2||canvas.height<2)throw new Error('อ่านขนาดเฟรมวิดีโอไม่ได้');
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  return canvas;
}
async function scanSelectedImages(){
  const files=Array.from($('image-input').files||[]);
  if(!files.length){message('เลือกรูปก่อนจ้า');return;}
  if(busy)return;
  setBusy(true);let done=0;let failed=0;let skipped=0;
  try {
    await ensureWorker();
    for(const file of files){
      status(`อ่านภาพ ${done+1}/${files.length}: ${file.name}`,done/files.length*100);
      const fingerprint=`${file.name}:${file.size}:${file.lastModified}`;
      const existing=segments.find(s=>s.fingerprint===fingerprint);
      try {
        const result=await readImageFile(file);
        const target=existing||addSegment('',file.name,{kind:'image',fingerprint});
         target.text=result.text.trim();target.source=file.name;target.kind='image';target.confidence=result.confidence;target.enhanced=result.enhanced;delete target.error;
        if(previews.has(target.id))URL.revokeObjectURL(previews.get(target.id));
        previews.set(target.id,URL.createObjectURL(file));
        if(existing)skipped++;
      } catch(err){
        failed++;
        const target=existing||addSegment('',file.name,{kind:'image',fingerprint});
        target.error=err.message;
        if(!existing)target.source=`${file.name} (อ่านไม่สำเร็จ)`;
      }
      done++;render();
    }
    message(`อ่าน ${done} ภาพแล้ว${skipped?` · อัปเดตภาพเดิม ${skipped}`:''}${failed?` · อ่านไม่สำเร็จ ${failed}`:''} · คัดลอกด้านล่างได้เลย`);
    $('export-title').scrollIntoView({behavior:'smooth',block:'start'});
  } catch(err){message('❌ '+err.message);} finally {setBusy(false);render();}
}
$('start-image').addEventListener('click',scanSelectedImages);
$('start-video').addEventListener('click',async()=>{
  const file=$('video-input').files?.[0];if(!file){message('เลือกวิดีโอก่อนจ้า');return;}
  const interval=Number($('interval').value)||1;
  setBusy(true);let holder;
  try {
    holder=await prepareVideo(file);
    await ensureWorker();
    const count=Math.min(MAX_VIDEO_FRAMES,Math.max(1,Math.ceil(holder.video.duration/interval)));
    let successes=0;
    for(let i=0;i<count;i++){
      const second=Math.min(holder.video.duration-0.05,Math.max(0.05,i*interval));
      status(`วิดีโอ ${i+1}/${count} · ${second.toFixed(1)} วินาที`,((i+1)/count)*100);
      try {
        const canvas=await seekAndCapture(holder.video,second);
        const crop=discordCropRect(canvas.width,canvas.height,$('auto-crop').checked);
        let area=canvas;
        if(crop.cropped){area=reducedCanvas(crop.width,crop.height,1600);area.getContext('2d').drawImage(canvas,crop.x,crop.y,crop.width,crop.height,0,0,area.width,area.height);}
        const result=await worker.recognize(area);
        addSegment(result.data.text,file.name,{kind:'video',second,confidence:result.data.confidence});successes++;
      }catch(err){addSegment('',`${file.name} (เฟรมผิดพลาด)`,{kind:'video',second,error:err.message});}
      render();
    }
    const incomplete=holder.video.duration>count*interval;
    message(`อ่านได้ ${successes}/${count} เฟรม${incomplete?' · ⚠️ คลิปยาวเกินขอบเขต อ่านไม่ถึงตอนท้าย':''} · โปรดตรวจจุดที่ขาดก่อนส่งออก`);
  } catch(err){message('❌ วิดีโอไม่สำเร็จ: '+err.message+' — ลองแคปภาพแทน หรือแปลงวิดีโอเป็น H.264 MP4');}
  finally{if(holder){holder.video.pause();holder.video.removeAttribute('src');holder.video.load();URL.revokeObjectURL(holder.url);}setBusy(false);render();}
});
$('add-text').addEventListener('click',()=>{
  const value=$('pasted-text').value.trim();if(!value){message('วางข้อความก่อนจ้า');return;}
  addSegment(value,'ข้อความที่วาง',{kind:'text'});$('pasted-text').value='';message('เพิ่มข้อความแล้ว');render();
});
$('demo').addEventListener('click',()=>{
  addSegment('ซาโยะ: วันนี้ลองทำอะไรดี\nสต๊าฟ: มีเห็ดเหลืออยู่\nเพื่อน: ทำซุปไหม','ตัวอย่าง 1',{kind:'demo'});
  addSegment('สต๊าฟ: มีเห็ดเหลืออยู่\nเพื่อน: ทำซุปไหม\nซาโยะ: งั้นทำซุปมิโสะกัน','ตัวอย่าง 2',{kind:'demo'});
  render();message('นี่เป็นข้อมูลสมมติ ลองเลื่อนและแก้ไขก่อน Export ได้เลย');
});
$('clear-all').addEventListener('click',()=>{
  if(!segments.length)return;
  if(confirm(`ต้องการลบข้อมูล ${segments.length} ช่วงที่กำลังตรวจแก้หรือไม่? ข้อมูลที่ยังไม่ได้ดาวน์โหลดจะหายไป`)){
    for(const url of previews.values())URL.revokeObjectURL(url);previews.clear();
    segments.length=0;render();message('ล้างข้อมูลแล้ว');
  }
});
function downloadBlob(contents,filename,type){
  const blob=new Blob([contents],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function archiveName(){return sanitizeTitle($('archive-title').value)}
$('export-md').addEventListener('click',()=>{
  const title=$('archive-title').value.trim()||'Discord Story Archive';
  const md=exportMarkdown(segments,title);
  const size=Number($('chunk-size').value)||8000;
  const pieces=splitText(md,size);
  pieces.forEach((part,i)=>{
    const header=pieces.length>1?`<!-- ส่วน ${i+1}/${pieces.length} · อ่านตามลำดับ -->\n\n`:'';
    downloadBlob(header+part,`${archiveName()}_${String(i+1).padStart(3,'0')}.md`,'text/markdown;charset=utf-8');
  });
  message(`ดาวน์โหลด Markdown ${pieces.length} ไฟล์แล้ว หากมือถือบล็อกหลายไฟล์ ลองเปลี่ยนขนาดให้ใหญ่ขึ้นหรือส่งออก TXT`);
});
$('export-txt').addEventListener('click',()=>{
  downloadBlob(mergeSegments(segments).text,`${archiveName()}.txt`,'text/plain;charset=utf-8');
});
$('export-json').addEventListener('click',()=>{
  const merged=mergeSegments(segments);
  const data={schema:'chatlens-v0.2',title:$('archive-title').value,exportedAt:new Date().toISOString(),notice:'User-provided captures only; completeness and OCR accuracy unverified',segments:segments.map(({id,...rest})=>rest),mergedText:merged.text,boundaryNotices:merged.notices};
  downloadBlob(JSON.stringify(data,null,2),`${archiveName()}.json`,'application/json;charset=utf-8');
});
loadSession();
render();

$('archive-title').addEventListener('input',scheduleSave);
$('copy-text').addEventListener('click', async()=>{
  const text=$('merged-preview').value;
  if(!text.trim())return;
  try {
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    message(`✓ คัดลอกแล้ว ${text.length.toLocaleString('th-TH')} ตัวอักษร เปิด ChatGPT แล้ววางได้เลย`);
  }catch(_){
    const box=$('merged-preview');box.focus();box.select();
    let copied=false;
    try{copied=document.execCommand('copy');}catch(_ignored){}
    message(copied?'✓ คัดลอกแล้ว นำไปวางใน ChatGPT ได้เลย':'เลือกข้อความให้แล้ว แตะค้างแล้วเลือก “คัดลอก” บนมือถือ');
  }
});
