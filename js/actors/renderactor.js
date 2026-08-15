import { createactor, createMessageValidator } from './actorkernel.js';
import { CREATEDOMREF } from '../fundamental/domref.js';
import { revalidateAll } from './trigerregistry.js';

export const MESSAGETYPES = Object.freeze({
  RENDER: 'render',
  CLEAR: 'clear',
  HTML: 'html',
  REMOVE: 'remove',
  SETSTYLES: 'setstyles',
  SETATTR: 'setattr',
  TOGGLECLASS: 'toggleclass',
  CRYPTO: 'crypto',
  GEOLOCATION: 'geolocation',
  PERSISTENCE: 'persistence',
  CREATEELEMENT: 'createelement',
  CREATECONTAINER: 'createcontainer',
  CREATEFROMHTML: 'createfromhtml',
  PROPERTY: 'property',
  GETHTML: 'gethtml',
  GETVALUE: 'getvalue',
  GETSTYLE: 'getstyle',
  GETPOSITION: 'getposition',
  GETLAYOUT: 'getlayout',
  SETHTML: 'sethtml',
  SETPOSITION: 'setposition',
  SETSTYLE: 'setstyle',
  SETVALUE: 'setvalue',
  SETLAYOUT: 'setlayout',
  GETVIEWPORT: 'getviewport',
  GETSCREEN: 'getscreen',
  MATCHMEDIA: 'matchmedia',
  GET_BODY_HTML: 'get_body_html',
  RESTORE_BODY_HTML: 'restore_body_html'
});

const MESSAGEINTERFACES = Object.freeze({
  [MESSAGETYPES.RENDER]: { id: 'string', renderer: 'function', data: 'any', env: 'object', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.CLEAR]: { id: 'string', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.HTML]: { id: 'string', markup: 'string', append: 'boolean', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.REMOVE]: { id: 'string', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETSTYLES]: { id: 'string', styles: 'object', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETATTR]: { id: 'string', name: 'string', value: 'string', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.TOGGLECLASS]: { id: 'string', classname: 'string', force: 'boolean', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.CRYPTO]: { bytes: 'number', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GEOLOCATION]: { enablehighaccuracy: 'boolean', timeout: 'number', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.PERSISTENCE]: { action: 'string', key: 'string?', value: 'string?', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.CREATEELEMENT]: { tag: 'string', props: 'object?', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.CREATECONTAINER]: { resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.CREATEFROMHTML]: { html: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.PROPERTY]: { id: 'string', name: 'string', arguments: 'array?', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETHTML]: { id: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETVALUE]: { id: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETSTYLE]: { id: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETPOSITION]: { id: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETLAYOUT]: { id: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.SETHTML]: { id: 'string', value: 'string', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETPOSITION]: { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETSTYLE]: { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETVALUE]: { id: 'string', value: 'any', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.SETLAYOUT]: { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.GETVIEWPORT]: { resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GETSCREEN]:   { resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.MATCHMEDIA]:  { query: 'string', resolve: 'function', reject: 'function?' },
  [MESSAGETYPES.GET_BODY_HTML]: { resolve: 'function?', reject: 'function?' },
  [MESSAGETYPES.RESTORE_BODY_HTML]: { html: 'string', resolve: 'function?', reject: 'function?' }
});

const validatemessage = createMessageValidator(MESSAGEINTERFACES);

const withElement = (id, reject, fn) => {
  if (!id || typeof id !== 'string') {
    if (typeof reject === 'function') reject(new Error('[RENDERACTOR] id must be a non-empty string'));
    return null;
  }
  const el = document.getElementById(id);
  if (!el) {
    if (typeof reject === 'function') reject(new Error('[RENDERACTOR] element not found: ' + id));
    return null;
  }
  return fn(el);
};

const resolveMsg = (msg, val) => typeof msg.resolve === 'function' && msg.resolve(val);
const rejectMsg = (msg, err) => typeof msg.reject === 'function' && msg.reject(err);

// Declarative Message Handlers Map
const HANDLERS = {
  [MESSAGETYPES.RENDER]: (state, msg) => {
    const target = msg.id ? document.getElementById(msg.id) : null;
    if (typeof msg.renderer === 'function') {
      try { msg.renderer(target, msg.data, msg.env || {}); }
      catch (err) { console.error('[RENDERACTOR] Renderer error:', err); throw err; }
    }
  },
  [MESSAGETYPES.CLEAR]: (state, msg) => withElement(msg.id, msg.reject, el => {
    el.innerHTML = '';
    revalidateAll();
    resolveMsg(msg);
  }),
  [MESSAGETYPES.HTML]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (msg.append) el.insertAdjacentHTML('beforeend', msg.markup);
    else { el.innerHTML = msg.markup; revalidateAll(); }
    resolveMsg(msg);
  }),
  [MESSAGETYPES.REMOVE]: (state, msg) => withElement(msg.id, msg.reject, el => {
    el.remove();
    revalidateAll();
    resolveMsg(msg);
  }),
  [MESSAGETYPES.SETSTYLES]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (msg.styles && typeof msg.styles === 'object') Object.assign(el.style, msg.styles);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.SETATTR]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (typeof msg.name === 'string') el.setAttribute(msg.name, msg.value);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.TOGGLECLASS]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (typeof msg.classname === 'string') el.classList.toggle(msg.classname, msg.force);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.CRYPTO]: (state, msg) => {
    const win = typeof window !== 'undefined' ? window : globalThis;
    const array = new Uint8Array(msg.bytes);
    win.crypto.getRandomValues(array);
    resolveMsg(msg, Array.from(array));
  },
  [MESSAGETYPES.GEOLOCATION]: (state, msg) => {
    const win = typeof window !== 'undefined' ? window : globalThis;
    const geo = win.navigator?.geolocation;
    if (!geo) return rejectMsg(msg, new Error('geolocation API unavailable'));
    geo.getCurrentPosition(
      pos => resolveMsg(msg, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => rejectMsg(msg, new Error('geolocation failed: ' + err.message)),
      { enablehighaccuracy: msg.enablehighaccuracy || false, timeout: msg.timeout || 5000 }
    );
  },
  [MESSAGETYPES.PERSISTENCE]: (state, msg) => {
    const storage = (typeof window !== 'undefined' ? window : globalThis).localStorage;
    if (!storage) return rejectMsg(msg, new Error('localStorage unavailable'));
    try {
      if (msg.action === 'getItem') resolveMsg(msg, { value: storage.getItem(msg.key) });
      else if (msg.action === 'setItem') { storage.setItem(msg.key, msg.value); resolveMsg(msg, { success: true }); }
      else if (msg.action === 'removeItem') { storage.removeItem(msg.key); resolveMsg(msg, { success: true }); }
      else if (msg.action === 'clear') { storage.clear(); resolveMsg(msg, { success: true }); }
      else rejectMsg(msg, new Error('unknown persistence action: ' + msg.action));
    } catch (err) { rejectMsg(msg, err); }
  },
  [MESSAGETYPES.CREATEELEMENT]: (state, msg) => {
    try {
      const el = document.createElement(msg.tag);
      if (msg.props && typeof msg.props === 'object') Object.assign(el, msg.props);
      resolveMsg(msg, CREATEDOMREF(el));
    } catch (err) { rejectMsg(msg, err); }
  },
  [MESSAGETYPES.CREATECONTAINER]: (state, msg) => {
    try { resolveMsg(msg, CREATEDOMREF(document.createElement('div'))); }
    catch (err) { rejectMsg(msg, err); }
  },
  [MESSAGETYPES.CREATEFROMHTML]: (state, msg) => {
    try {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = msg.html;
      resolveMsg(msg, CREATEDOMREF(wrapper.firstElementChild || wrapper));
    } catch (err) { rejectMsg(msg, err); }
  },
  [MESSAGETYPES.PROPERTY]: (state, msg) => withElement(msg.id, msg.reject, el => {
    const fn = el[msg.name];
    if (typeof fn !== 'function') return rejectMsg(msg, new Error(`property "${msg.name}" is not a function on element ${msg.id}`));
    try { resolveMsg(msg, fn.apply(el, msg.arguments || [])); }
    catch (e) { rejectMsg(msg, e); }
  }),
  [MESSAGETYPES.GETHTML]: (state, msg) => withElement(msg.id, msg.reject, el => {
    resolveMsg(msg, { tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML });
  }),
  [MESSAGETYPES.GETVALUE]: (state, msg) => withElement(msg.id, msg.reject, el => resolveMsg(msg, el.value)),
  [MESSAGETYPES.GETSTYLE]: (state, msg) => withElement(msg.id, msg.reject, el => {
    const computed = window.getComputedStyle(el);
    const styleobj = {};
    for (let si = 0; si < computed.length; si++) styleobj[computed[si]] = computed.getPropertyValue(computed[si]);
    resolveMsg(msg, styleobj);
  }),
  [MESSAGETYPES.GETPOSITION]: (state, msg) => withElement(msg.id, msg.reject, el => {
    const rect = el.getBoundingClientRect();
    resolveMsg(msg, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
  }),
  [MESSAGETYPES.GETLAYOUT]: (state, msg) => withElement(msg.id, msg.reject, el => {
    resolveMsg(msg, {
      offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight,
      offsetLeft: el.offsetLeft, offsetTop: el.offsetTop,
      scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth, clientHeight: el.clientHeight
    });
  }),
  [MESSAGETYPES.SETHTML]: (state, msg) => withElement(msg.id, msg.reject, el => {
    el.innerHTML = msg.value;
    revalidateAll();
    resolveMsg(msg);
  }),
  [MESSAGETYPES.SETPOSITION]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (msg.value && typeof msg.value === 'object') Object.assign(el.style, msg.value);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.SETSTYLE]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (msg.value && typeof msg.value === 'object') Object.assign(el.style, msg.value);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.SETVALUE]: (state, msg) => withElement(msg.id, msg.reject, el => { el.value = msg.value; resolveMsg(msg); }),
  [MESSAGETYPES.SETLAYOUT]: (state, msg) => withElement(msg.id, msg.reject, el => {
    if (msg.value && typeof msg.value === 'object') Object.assign(el, msg.value);
    resolveMsg(msg);
  }),
  [MESSAGETYPES.GETVIEWPORT]: (state, msg) => {
    const doc = document.documentElement;
    resolveMsg(msg, { viewportWidth: doc.clientWidth, viewportHeight: doc.clientHeight });
  },
  [MESSAGETYPES.GETSCREEN]: (state, msg) => {
    const scr = window.screen;
    resolveMsg(msg, { screenWidth: scr.width, screenHeight: scr.height, availWidth: scr.availWidth, availHeight: scr.availHeight });
  },
  [MESSAGETYPES.MATCHMEDIA]: (state, msg) => resolveMsg(msg, { matches: window.matchMedia(msg.query).matches }),
  [MESSAGETYPES.GET_BODY_HTML]: (state, msg) => resolveMsg(msg, document.body ? document.body.innerHTML : ''),
  [MESSAGETYPES.RESTORE_BODY_HTML]: (state, msg) => {
    if (document.body) { document.body.innerHTML = msg.html; revalidateAll(); }
    resolveMsg(msg, true);
  }
};

let refcounter = 0;
const renderbehavior = (state, message) => {
  if (message.type === MESSAGETYPES.RENDER && (message.id === null || message.id === undefined)) {
    refcounter += 1;
    message.id = '__ref_render_' + Date.now() + '_' + refcounter;
  }

  const check = validatemessage(message);
  if (!check.valid) {
    console.error('[RENDERACTOR:UNKNOWNTYPE] type=' + check.type + ' error=' + check.error);
    return state;
  }

  const handler = HANDLERS[message.type];
  if (handler) handler(state, message);
  return state;
};

export const RENDERACTOR = createactor(renderbehavior, {});

const createEnqueuer = (type, idRequired, extraPayloadFn) => (...args) => {
  const id = idRequired ? args[0] : undefined;
  const rest = idRequired ? args.slice(1) : args;
  return new Promise((resolve, reject) => {
    if (idRequired && (!id || typeof id !== 'string' || !document.getElementById(id))) {
      reject(new Error(`[${type}] invalid or missing element id: ${id}`));
      return;
    }
    const extra = extraPayloadFn ? extraPayloadFn(rest) : {};
    RENDERACTOR.send({ type, id, resolve, reject, ...extra });
  });
};

export const enqueuerender = createEnqueuer(MESSAGETYPES.RENDER, true, ([renderer, data, env]) => ({ renderer, data, env }));
export const enqueueclear = createEnqueuer(MESSAGETYPES.CLEAR, true);
export const enqueuehtml = createEnqueuer(MESSAGETYPES.HTML, true, ([markup, append]) => ({ markup, append }));
export const enqueueremove = createEnqueuer(MESSAGETYPES.REMOVE, true);
export const enqueuestyles = createEnqueuer(MESSAGETYPES.SETSTYLES, true, ([styles]) => ({ styles }));
export const enqueuesetattr = createEnqueuer(MESSAGETYPES.SETATTR, true, ([name, value]) => ({ name, value }));
export const enqueuetoggleclass = createEnqueuer(MESSAGETYPES.TOGGLECLASS, true, ([classname, force]) => ({ classname, force }));
export const enqueuecreateelement = createEnqueuer(MESSAGETYPES.CREATEELEMENT, false, ([tag, props]) => ({ tag, props }));
export const enqueuecreatecontainer = createEnqueuer(MESSAGETYPES.CREATECONTAINER, false);
export const enqueuecreatefromhtml = createEnqueuer(MESSAGETYPES.CREATEFROMHTML, false, ([html]) => ({ html }));
export const enqueuegethtml = createEnqueuer(MESSAGETYPES.GETHTML, true);
export const enqueuegetvalue = createEnqueuer(MESSAGETYPES.GETVALUE, true);
export const enqueuegetstyle = createEnqueuer(MESSAGETYPES.GETSTYLE, true);
export const enqueuegetposition = createEnqueuer(MESSAGETYPES.GETPOSITION, true);
export const enqueuesethtml = createEnqueuer(MESSAGETYPES.SETHTML, true, ([value]) => ({ value }));
export const enqueuesetposition = createEnqueuer(MESSAGETYPES.SETPOSITION, true, ([value]) => ({ value }));
export const enqueuesetstyle = createEnqueuer(MESSAGETYPES.SETSTYLE, true, ([value]) => ({ value }));
export const enqueuesetvalue = createEnqueuer(MESSAGETYPES.SETVALUE, true, ([value]) => ({ value }));
export const enqueueproperty = createEnqueuer(MESSAGETYPES.PROPERTY, true, ([name, args]) => ({ name, arguments: args }));
export const enqueuegetlayout = createEnqueuer(MESSAGETYPES.GETLAYOUT, true);
export const enqueusetlayout = createEnqueuer(MESSAGETYPES.SETLAYOUT, true, ([value]) => ({ value }));
export const enqueuegetviewport = createEnqueuer(MESSAGETYPES.GETVIEWPORT, false);
export const enqueuegetscreen = createEnqueuer(MESSAGETYPES.GETSCREEN, false);
export const enqueuematchmedia = createEnqueuer(MESSAGETYPES.MATCHMEDIA, false, ([query]) => ({ query }));

export const DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
export const DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
export const DOMQUERYMESSAGES = Object.freeze([...DOMQUERYGETTERS, ...DOMQUERYSETTERS]);

export const expectelement = (id, timeout = 30000) => new Promise((resolve, reject) => {
  const existing = document.getElementById(id);
  if (existing) return resolve(CREATEDOMREF(existing));

  let observer = null;
  const timeoutid = setTimeout(() => {
    if (observer) observer.disconnect();
    reject(new Error('[expectelement] element not found: ' + id));
  }, timeout);

  observer = new MutationObserver(() => {
    const el = document.getElementById(id);
    if (el) {
      clearTimeout(timeoutid);
      observer.disconnect();
      resolve(CREATEDOMREF(el));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

export const handlefilereaderrequest = (payload) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve({ text: e.target.result });
  reader.onerror = () => reject(new Error('[renderactor] FileReader error'));
  reader.readAsText(payload.file);
});

export const enqueueRenderGetBodyHtml = () =>
  new Promise((resolve, reject) => RENDERACTOR.send({ type: MESSAGETYPES.GET_BODY_HTML, resolve, reject }));

export const enqueueRenderRestoreBodyHtml = (html) =>
  new Promise((resolve, reject) => RENDERACTOR.send({ type: MESSAGETYPES.RESTORE_BODY_HTML, html, resolve, reject }));
