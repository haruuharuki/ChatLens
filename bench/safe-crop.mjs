/** D.2a: conservative mobile benchmark crop; never reuse the old aggressive
 * iPhone-only crop for a different aspect ratio. Retain extra UI rather than
 * remove the start of a message. Still heuristic, not a layout detector.
 */
export function benchmarkCropRect(width,height,enabled=true){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Invalid source dimensions');
 const aspect=height/width;
 if(!enabled||aspect<1.45||aspect>3.2||height<700)return {x:0,y:0,width,height,cropped:false};
 const x=Math.round(width*.06),y=Math.round(height*.07),bottom=Math.round(height*.06);
 return {x,y,width:width-x,height:height-y-bottom,cropped:true};
}
