// js/actors/renderactormetrics.js — render-actor viewport and font
// measurement helpers.
//
// @proposal=CP3 (CYCLE-25) — extracted from /js/actors/renderactor.js
// as concern R3 (viewport and font measurement). The function bodies
// are byte-identical to their pre-split forms. The load order places
// this file after renderactorprimitives.js and before
// renderactorhandlerlayout.js (whose layout corrections consume the
// measurements).

function SU_detectviewportwidth() {
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

function SU_detectfontsize(node) {
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      if (node && typeof node === 'object' && node.nodeType === 1) {
        var cs = window.getComputedStyle(node);
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

function SU_detectviewportheight() {
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
