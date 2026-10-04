function SUDETECTVIEWPORTWIDTH() {
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth > 0) {
    return document.documentElement.clientWidth;
  }
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth > 0) {
    return window.innerWidth;
  }
  if (typeof window !== 'undefined' && window.screen && typeof window.screen.width === 'number' && window.screen.width > 0) {
    var dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
    return Math.round(window.screen.width / dpr);
  }
  return null;
}

function SUDETECTFONTSIZE(NODE) {
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      if (NODE && typeof NODE === 'object' && NODE.nodeType === 1) {
        var cs = window.getComputedStyle(NODE);
        if (cs && cs.fontSize) {
          var v = parseFloat(cs.fontSize);
          if (isFinite(v) && v > 0) return v;
        }
      }
      if (typeof document !== 'undefined' && document.documentElement) {
        var csr = window.getComputedStyle(document.documentElement);
        if (csr && csr.fontSize) {
          var vr = parseFloat(csr.fontSize);
          if (isFinite(vr) && vr > 0) return vr;
        }
      }
    } catch (_) { /* non-fatal */ }
  }
  return 16;
}

function SUDETECTVIEWPORTHEIGHT() {
  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientHeight > 0) {
    return document.documentElement.clientHeight;
  }
  if (typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0) {
    return window.innerHeight;
  }
  if (typeof window !== 'undefined' && window.screen && typeof window.screen.height === 'number' && window.screen.height > 0) {
    var dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
    return Math.round(window.screen.height / dpr);
  }
  return null;
}
