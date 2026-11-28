/** Bench-only Discord locale parser. Never infer missing date/time. */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const EN=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})\b/i;
const NUM=/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s*(BE|CE|พ\.?ศ\.?|ค\.?ศ\.?))?(?!\d)/iu;
const CLOCK=/\b(\d{1,2})[:.]([0-5]\d)(?:\s*(AM|PM)\b)?(?![\d:]|\s*[AP]M\b)/i;
function formatted(m,d,y){const dt=new Date(Date.UTC(y,m-1,d));return m>=1&&m<=12&&y>=2000&&y<=2099&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${MONTHS[m-1]} ${d}, ${y}`:null;}
function dateMatch(s){
 const en=EN.exec(s);if(en)return {raw:en[0],index:en.index,date:formatted(MONTHS.findIndex(x=>x.toLowerCase()===en[1].toLowerCase())+1,+en[2],+en[3])};
 const n=NUM.exec(s);if(!n)return null;
 const a=+n[1],b=+n[2],year=+n[3],era=(n[4]||'').toUpperCase();
 const be=era==='BE'||era.startsWith('พ')||(!era&&year>=2543&&year<=2642);
 const y=be?year-543:n[3].length===2?2000+year:year;
 // Keep previous US numeric convention for ambiguous unmarked CE dates.
 // Explicit Buddhist era or first field >12 identifies day/month ordering.
 const dayFirst=be||a>12;
 return {raw:n[0],index:n.index,date:formatted(dayFirst?b:a,dayFirst?a:b,y)};
}
export function dateFromOCR(text){return dateMatch(String(text||''))?.date||null;}
export function dateSeparator(text){const s=String(text||'').trim(),d=dateMatch(s);return d?.date&&d.index===0&&d.raw.length===s.length?d.date:null;}
export function parseDiscordTimestamp(text,{allowBare24=false}={}){
 const s=String(text||'');const d=dateMatch(s);
 const parseClock=(m)=>{if(!m)return null;const h=+m[1],minute=m[2],ap=m[3]?.toUpperCase();if(ap?(h<1||h>12):(h>23||!m[0].includes(':')))return null;return `${ap?h:(h%12||12)}:${minute} ${ap||(h<12?'AM':'PM')}`;};
 if(d){if(!d.date)return null;const rest=s.slice(d.index+d.raw.length),gap=/^[\s,]+/.exec(rest);const m=gap?CLOCK.exec(rest.slice(gap[0].length)):null;
  if(m?.index===0){const time=parseClock(m);if(!time)return null;const end=d.index+d.raw.length+gap[0].length+m[0].length;return {index:d.index,end,raw:s.slice(d.index,end),time,date:d.date};}}
 const m=CLOCK.exec(s),time=parseClock(m);if(!m||!time||(!m[3]&&!allowBare24))return null;
 return {index:m.index,end:m.index+m[0].length,raw:m[0],time,date:null};
}
