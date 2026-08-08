// Pure color computation utilities
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1],16), parseInt(result[2],16), parseInt(result[3],16)] : [0,0,0];
}
export function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');
}
export function rgbToHsl(r,g,b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0,s=0,l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r: h=((g-b)/d+(g<b?6:0))/6; break;
      case g: h=((b-r)/d+2)/6; break;
      case b: h=((r-g)/d+4)/6; break;
    }
  }
  return {h:Math.round(h*360), s:Math.round(s*100), l:Math.round(l*100)};
}
export function hslToRgb(h,s,l) {
  s/=100; l/=100;
  const k=n=>(n+h/30)%12;
  const a=s*Math.min(l,1-l);
  const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)];
}
export function contrastRatio(color1, color2) {
  function luminance(r,g,b){
    const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }
  const parse=c=>c.startsWith('#')?hexToRgb(c):[0,0,0];
  const [r1,g1,b1]=parse(color1),[r2,g2,b2]=parse(color2);
  const l1=luminance(r1,g1,b1),l2=luminance(r2,g2,b2);
  const lighter=Math.max(l1,l2),darker=Math.min(l1,l2);
  return (lighter+0.05)/(darker+0.05);
}
export function computeForeground(desired, bg, minRatio=4.5) {
  let fgHex=desired;
  let ratio=contrastRatio(fgHex,bg);
  if(ratio>=minRatio) return fgHex;
  let fgHsl=rgbToHsl(...hexToRgb(fgHex));
  let bgHsl=rgbToHsl(...hexToRgb(bg));
  const step=bgHsl.l>50?-5:5;
  for(let i=0;i<20;i++){
    fgHsl.l=Math.max(0,Math.min(100,fgHsl.l+step));
    const newRgb=hslToRgb(fgHsl.h,fgHsl.s,fgHsl.l);
    fgHex=rgbToHex(...newRgb);
    if(contrastRatio(fgHex,bg)>=minRatio) break;
  }
  return fgHex;
}
export function emphasize(color, bg, intensity=1) {
  const fgHsl=rgbToHsl(...hexToRgb(color));
  const bgHsl=rgbToHsl(...hexToRgb(bg));
  if(Math.abs(fgHsl.h-bgHsl.h)<30) fgHsl.h=(fgHsl.h+30)%360;
  fgHsl.s=Math.min(100,fgHsl.s+15*intensity);
  const lDiff=Math.abs(fgHsl.l-bgHsl.l);
  if(lDiff<40) fgHsl.l=fgHsl.l>bgHsl.l?Math.min(100,fgHsl.l+20):Math.max(0,fgHsl.l-20);
  return rgbToHex(...hslToRgb(fgHsl.h,fgHsl.s,fgHsl.l));
}
export function extractColor(styleObj, prop, fallback) {
  const val = styleObj[prop];
  return typeof val === 'string' && val.length ? val : fallback;
}
