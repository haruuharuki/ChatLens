/**
 * OpenThai 2.1 recognizer-only research helpers.
 * Does NOT replicate OpenThai's production detector, rec2, Thai normalization,
 * complex line splitting or confidence-driven re-reads. No I/O here.
 */
export const OPEN_THAI_REVISION = 'v2.1.4';
export const MODEL_PATH = `https://huggingface.co/iapp/OpenThai2.1-OCR-Text-20261118/resolve/${OPEN_THAI_REVISION}/rec.onnx`;
export const DICTIONARY_PATH = `https://huggingface.co/iapp/OpenThai2.1-OCR-Text-20261118/resolve/${OPEN_THAI_REVISION}/rec_dict.txt`;
export const ORT_VERSION = '1.22.0';
export const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

export function usableLineBox(line, imageWidth, imageHeight) {
  const b = line?.bbox || {};
  const v = [b.x0, b.y0, b.x1, b.y1].map(Number);
  if (v.some(n => !Number.isFinite(n))) return null;
  const [x0,y0,x1,y1]=v;
  if(x0<0||y0<0||x1>imageWidth+2||y1>imageHeight+2||x1<=x0||y1<=y0) return null;
  if(x1-x0<24 || y1-y0<8) return null;
  return {x0,y0,x1,y1};
}

/** Fit line crop to recognizer height 48; target width divisible by 32. */
export function recognitionSize(width,height,{maxWidth=1536}={}){
  if(!(width>0&&height>0)) throw new Error('Invalid line dimensions');
  const scaled=Math.round((48*width)/height);
  const target=Math.min(maxWidth,Math.max(64,Math.ceil(scaled/32)*32));
  return {height:48,width:target,drawWidth:Math.min(target,Math.max(1,scaled))};
}

/**
 * Create a standard Paddle recognizer NCHW tensor from already-resized RGBA pixels.
 * Output is BGR/RGB (selectable) [-1,1], right padding zero in normalized space.
 * This is a research approximation, not a byte-for-byte Python runtime port.
 */
export function recognitionTensorFromRGBA(rgba,width,height,drawWidth,{invert=true,channelOrder='bgr'}={}) {
  if(!rgba||width<1||height!==48||rgba.length!==width*height*4||drawWidth<1||drawWidth>width) throw new Error('Invalid recognizer bitmap');
  if(!['rgb','bgr'].includes(channelOrder)) throw new Error('Invalid color channel order');
  const area=width*height, data=new Float32Array(area*3);
  const channel=channelOrder==='bgr'?[2,1,0]:[0,1,2];
  for(let y=0;y<height;y++) for(let x=0;x<drawWidth;x++){
    const px=(y*width+x)*4;
    for(let c=0;c<3;c++){
      const raw=rgba[px+channel[c]];
      const val=invert?255-raw:raw;
      data[c*area+y*width+x]=(val/127.5)-1;
    }
  }
  return {data,dims:[1,3,height,width]};
}

export function parseDictionary(text){
  const lines=String(text??'').replace(/\r/g,'').split('\n');
  if(lines.at(-1)==='')lines.pop();
  return lines;
}

/** Greedy CTC decode; blank index=0, repeated identical adjacent classes merge. */
export function greedyCTC(probabilities,dims,dictionary){
  if(!probabilities||!Array.isArray(dims)||dims.length!==3||dims[0]!==1||!Array.isArray(dictionary)) throw new Error('Invalid recognizer output');
  const symbols=dictionary.length;
  let steps,classes,layout;
  if(dims[2]===symbols+1||dims[2]===symbols+2){steps=dims[1];classes=dims[2];layout='NTC';}
  else if(dims[1]===symbols+1||dims[1]===symbols+2){steps=dims[2];classes=dims[1];layout='NCT';}
  else throw new Error(`Recognizer output classes do not match dictionary (${dims.join('×')} / dict ${symbols})`);
  if(probabilities.length<steps*classes)throw new Error('Recognizer output buffer truncated');
  const vocabulary=['',...dictionary];
  if(classes===symbols+2)vocabulary.push(' ');
  let prev=-1,text='',sum=0,recognized=0;
  for(let t=0;t<steps;t++){
    let best=-Infinity,idx=0;
    for(let c=0;c<classes;c++){
      const score=layout==='NTC'?probabilities[t*classes+c]:probabilities[c*steps+t];
      if(score>best){best=score;idx=c;}
    }
    if(idx!==0&&idx!==prev){
      text+=vocabulary[idx]??'';
      if(Number.isFinite(best)){sum+=best;recognized++;}
    }
    prev=idx;
  }
  return {text,meanMaxScore:recognized?sum/recognized:null,steps,layout};
}
