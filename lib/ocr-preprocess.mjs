/**
 * Contrast adjustment for DARK mobile chat captures. No text is synthesized.
 * The raw image remains available in the review panel. This is not a Thai OCR fix.
 * JS/Canvas only; no uploads or external ML service.
 */
export function inkValue(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return Math.max(0, Math.min(255, Math.round(255 - (lum - 40) * 1.55)));
}

/** Does the cropped image look like dark Discord (rather than a light page)? */
export function isDarkScreenshot(data, width, height) {
  if (!data || !width || !height) return false;
  // Sample along the right margin, usually empty background, not text/media.
  const xs = [0.93, 0.98];
  const ys = [0.05, 0.27, 0.51, 0.72, 0.92];
  let dark = 0;
  for (const fy of ys) for (const fx of xs) {
    const i = (Math.min(height-1,Math.floor(height*fy))*width + Math.min(width-1,Math.floor(width*fx)))*4;
    if (0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2] < 105) dark++;
  }
  return dark >= 7;
}

/**
 * Mutates a dedicated OCR canvas only, not a screenshot or user edit.
 * Returns false if source is not confidently a dark screenshot.
 */
export function prepareDarkChatForOCR(canvas) {
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  if (!ctx) return false;
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return false;
  const img = ctx.getImageData(0,0,w,h);
  const rgba = img.data;
  if (!isDarkScreenshot(rgba,w,h)) return false;
  for (let i=0;i<rgba.length;i+=4) {
    const value=inkValue(rgba[i],rgba[i+1],rgba[i+2]);
    rgba[i]=rgba[i+1]=rgba[i+2]=value;
    rgba[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  return true;
}
