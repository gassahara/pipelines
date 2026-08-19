import { createactor } from './actorkernel.js';
import { createActorRegistry, setRenderActor } from './actorregistry.js';
import { createTriggerRegistry, revalidateAll } from './trigerregistry.js';
import { CREATEDOMREF } from '../fundamental/domref.js';
import { enqueueDbStore, enqueueDbRestore, enqueueDbDelete } from './dbactor.js';

var MESSAGETYPES = Object.freeze({
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
  RESTORE_BODY_HTML: 'restore_body_html',
  RECOVER: 'recover'
});

var MESSAGEINTERFACES = {};
MESSAGEINTERFACES[MESSAGETYPES.RENDER] = { id: 'string', renderer: 'function', data: 'any', env: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.CLEAR] = { id: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.HTML] = { id: 'string', markup: 'string', append: 'boolean', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.REMOVE] = { id: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETSTYLES] = { id: 'string', styles: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETATTR] = { id: 'string', name: 'string', value: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.TOGGLECLASS] = { id: 'string', classname: 'string', force: 'boolean', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.CRYPTO] = { bytes: 'number', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GEOLOCATION] = { enablehighaccuracy: 'boolean', timeout: 'number', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.PERSISTENCE] = { action: 'string', key: 'string?', value: 'string?', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.CREATEELEMENT] = { tag: 'string', props: 'object?', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.CREATECONTAINER] = { resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.CREATEFROMHTML] = { html: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.PROPERTY] = { id: 'string', name: 'string', arguments: 'array?', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETHTML] = { id: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETVALUE] = { id: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETSTYLE] = { id: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETPOSITION] = { id: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETLAYOUT] = { id: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETHTML] = { id: 'string', value: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETPOSITION] = { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETSTYLE] = { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETVALUE] = { id: 'string', value: 'any', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.SETLAYOUT] = { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETVIEWPORT] = { resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GETSCREEN] = { resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.MATCHMEDIA] = { query: 'string', resolve: 'function', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.GET_BODY_HTML] = { resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.RESTORE_BODY_HTML] = { html: 'string', resolve: 'function?', reject: 'function?' };
MESSAGEINTERFACES[MESSAGETYPES.RECOVER] = { resolve: 'function?', reject: 'function?' };
Object.freeze(MESSAGEINTERFACES);

function createInitialRenderWorldmap() {
  return {
    html: '',
    viewport: null
  };
}

function persistRenderWorldmap(state) {
  state.worldmap.html = document.body ? document.body.innerHTML : '';
  enqueueDbStore('actor:state:render', state.worldmap).catch(function(e) {
    console.warn('[RENDERACTOR] state persist failed:', e);
  });
}

function withElement(id, reject, fn) {
  if (!id || typeof id !== 'string') {
    if (typeof reject === 'function') reject(new Error('[RENDERACTOR] id must be a non-empty string'));
    return null;
  }
  var el = document.getElementById(id);
  if (!el) {
    if (typeof reject === 'function') reject(new Error('[RENDERACTOR] element not found: ' + id));
    return null;
  }
  return fn(el);
}

function resolveMsg(msg, val) { if (typeof msg.resolve === 'function') msg.resolve(val); }
function rejectMsg(msg, err) { if (typeof msg.reject === 'function') msg.reject(err); }

var HANDLERS = {};

HANDLERS[MESSAGETYPES.RENDER] = function(state, msg) {
  var target = msg.id ? document.getElementById(msg.id) : null;
  if (typeof msg.renderer === 'function') {
    try { msg.renderer(target, msg.data, msg.env || {}); }
    catch (err) { console.error('[RENDERACTOR] Renderer error:', err); throw err; }
  }
};

HANDLERS[MESSAGETYPES.CLEAR] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    el.innerHTML = '';
    revalidateAll(state.triggerRegistry);
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.HTML] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (msg.append) el.insertAdjacentHTML('beforeend', msg.markup);
    else { el.innerHTML = msg.markup; revalidateAll(state.triggerRegistry); }
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.REMOVE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    el.remove();
    revalidateAll(state.triggerRegistry);
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETSTYLES] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (msg.styles && typeof msg.styles === 'object') {
      Object.keys(msg.styles).forEach(function(prop) { el.style[prop] = msg.styles[prop]; });
    }
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETATTR] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (typeof msg.name === 'string') el.setAttribute(msg.name, msg.value);
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (typeof msg.classname === 'string') el.classList.toggle(msg.classname, msg.force);
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.CRYPTO] = function(state, msg) {
  var win = typeof window !== 'undefined' ? window : globalThis;
  var array = new Uint8Array(msg.bytes);
  win.crypto.getRandomValues(array);
  resolveMsg(msg, Array.prototype.slice.call(array));
};

HANDLERS[MESSAGETYPES.GEOLOCATION] = function(state, msg) {
  var win = typeof window !== 'undefined' ? window : globalThis;
  var geo = win.navigator && win.navigator.geolocation;
  if (!geo) return rejectMsg(msg, new Error('geolocation API unavailable'));
  geo.getCurrentPosition(
    function(pos) { resolveMsg(msg, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
    function(err) { rejectMsg(msg, new Error('geolocation failed: ' + err.message)); },
    { enablehighaccuracy: msg.enablehighaccuracy || false, timeout: msg.timeout || 5000 }
  );
};

HANDLERS[MESSAGETYPES.PERSISTENCE] = function(state, msg) {
  var storage = (typeof window !== 'undefined' ? window : globalThis).localStorage;
  if (!storage) return rejectMsg(msg, new Error('localStorage unavailable'));
  try {
    if (msg.action === 'getItem') resolveMsg(msg, { value: storage.getItem(msg.key) });
    else if (msg.action === 'setItem') { storage.setItem(msg.key, msg.value); resolveMsg(msg, { success: true }); }
    else if (msg.action === 'removeItem') { storage.removeItem(msg.key); resolveMsg(msg, { success: true }); }
    else if (msg.action === 'clear') { storage.clear(); resolveMsg(msg, { success: true }); }
    else rejectMsg(msg, new Error('unknown persistence action: ' + msg.action));
  } catch (err) { rejectMsg(msg, err); }
};

HANDLERS[MESSAGETYPES.CREATEELEMENT] = function(state, msg) {
  persistRenderWorldmap(state);
  try {
    var el = document.createElement(msg.tag);
    if (msg.props && typeof msg.props === 'object') {
      Object.keys(msg.props).forEach(function(prop) { el[prop] = msg.props[prop]; });
    }
    resolveMsg(msg, CREATEDOMREF(el, state.actorRegistry));
  } catch (err) { rejectMsg(msg, err); }
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(state, msg) {
  persistRenderWorldmap(state);
  try { resolveMsg(msg, CREATEDOMREF(document.createElement('div'), state.actorRegistry)); }
  catch (err) { rejectMsg(msg, err); }
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(state, msg) {
  persistRenderWorldmap(state);
  try {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = msg.html;
    var child = wrapper.firstElementChild || wrapper;
    resolveMsg(msg, CREATEDOMREF(child, state.actorRegistry));
  } catch (err) { rejectMsg(msg, err); }
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.PROPERTY] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) {
    var fn = el[msg.name];
    if (typeof fn !== 'function') return rejectMsg(msg, new Error('property "' + msg.name + '" is not a function on element ' + msg.id));
    try { resolveMsg(msg, fn.apply(el, msg.arguments || [])); }
    catch (e) { rejectMsg(msg, e); }
  });
};

HANDLERS[MESSAGETYPES.GETHTML] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) {
    resolveMsg(msg, { tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML });
  });
};

HANDLERS[MESSAGETYPES.GETVALUE] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) { resolveMsg(msg, el.value); });
};

HANDLERS[MESSAGETYPES.GETSTYLE] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) {
    var computed = window.getComputedStyle(el);
    var styleobj = {};
    for (var si = 0; si < computed.length; si++) styleobj[computed[si]] = computed.getPropertyValue(computed[si]);
    resolveMsg(msg, styleobj);
  });
};

HANDLERS[MESSAGETYPES.GETPOSITION] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) {
    var rect = el.getBoundingClientRect();
    resolveMsg(msg, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
  });
};

HANDLERS[MESSAGETYPES.GETLAYOUT] = function(state, msg) {
  withElement(msg.id, msg.reject, function(el) {
    resolveMsg(msg, {
      offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight,
      offsetLeft: el.offsetLeft, offsetTop: el.offsetTop,
      scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth, clientHeight: el.clientHeight
    });
  });
};

HANDLERS[MESSAGETYPES.SETHTML] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    el.innerHTML = msg.value;
    revalidateAll(state.triggerRegistry);
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETPOSITION] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (msg.value && typeof msg.value === 'object') {
      Object.keys(msg.value).forEach(function(prop) { el.style[prop] = msg.value[prop]; });
    }
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETSTYLE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (msg.value && typeof msg.value === 'object') {
      Object.keys(msg.value).forEach(function(prop) { el.style[prop] = msg.value[prop]; });
    }
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETVALUE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    el.value = msg.value;
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.SETLAYOUT] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, msg.reject, function(el) {
    if (msg.value && typeof msg.value === 'object') {
      Object.keys(msg.value).forEach(function(prop) { el[prop] = msg.value[prop]; });
    }
    resolveMsg(msg);
  });
  persistRenderWorldmap(state);
};

HANDLERS[MESSAGETYPES.GETVIEWPORT] = function(state, msg) {
  var doc = document.documentElement;
  resolveMsg(msg, { viewportWidth: doc.clientWidth, viewportHeight: doc.clientHeight });
};

HANDLERS[MESSAGETYPES.GETSCREEN] = function(state, msg) {
  var scr = window.screen;
  resolveMsg(msg, { screenWidth: scr.width, screenHeight: scr.height, availWidth: scr.availWidth, availHeight: scr.availHeight });
};

HANDLERS[MESSAGETYPES.MATCHMEDIA] = function(state, msg) {
  resolveMsg(msg, { matches: window.matchMedia(msg.query).matches });
};

HANDLERS[MESSAGETYPES.GET_BODY_HTML] = function(state, msg) {
  resolveMsg(msg, document.body ? document.body.innerHTML : '');
};

HANDLERS[MESSAGETYPES.RESTORE_BODY_HTML] = function(state, msg) {
  persistRenderWorldmap(state);
  if (document.body) {
    document.body.innerHTML = msg.html;
    revalidateAll(state.triggerRegistry);
  }
  persistRenderWorldmap(state);
  resolveMsg(msg, true);
};

HANDLERS[MESSAGETYPES.RECOVER] = function(state, msg) {
  enqueueDbRestore('actor:state:render').then(function(saved) {
    if (saved) {
      state.worldmap = saved;
      if (document.body) {
        document.body.innerHTML = saved.html;
        revalidateAll(state.triggerRegistry);
      }
    } else {
      state.worldmap = createInitialRenderWorldmap();
      persistRenderWorldmap(state);
    }
    if (typeof msg.resolve === 'function') msg.resolve(state);
  }).catch(function(e) {
    console.warn('[RENDERACTOR] state restore failed:', e);
    state.worldmap = createInitialRenderWorldmap();
    persistRenderWorldmap(state);
    if (typeof msg.resolve === 'function') msg.resolve(state);
  });
};

var refcounter = 0;

var renderbehavior = function(state, message) {
  if (message.type === MESSAGETYPES.RENDER && (message.id === null || message.id === undefined)) {
    refcounter += 1;
    message.id = '__ref_render_' + Date.now() + '_' + refcounter;
  }

  var handler = HANDLERS[message.type];
  if (handler) handler(state, message);
  return state;
};

var renderMailboxStore = {
  store: enqueueDbStore,
  restore: enqueueDbRestore,
  delete: enqueueDbDelete
};

var initialState = {
  triggerRegistry: createTriggerRegistry(),
  actorRegistry: createActorRegistry(),
  worldmap: createInitialRenderWorldmap()
};

var RENDERACTOR = createactor(
  renderbehavior,
  initialState,
  MESSAGEINTERFACES,
  {
    actorName: 'renderactor',
    mailboxType: 'db',
    mailboxStore: renderMailboxStore
  }
);

initialState.actorRegistry = setRenderActor(initialState.actorRegistry, RENDERACTOR);

function createEnqueuer(type, idRequired, extraPayloadFn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var id;
    var rest;
    if (idRequired) {
      id = args[0];
      rest = args.slice(1);
    } else {
      id = undefined;
      rest = args;
    }
    return new Promise(function(resolve, reject) {
      if (idRequired && (!id || typeof id !== 'string' || !document.getElementById(id))) {
        reject(new Error('[' + type + '] invalid or missing element id: ' + id));
        return;
      }
      var extra = extraPayloadFn ? extraPayloadFn(rest) : {};
      var message = { type: type, id: id, resolve: resolve, reject: reject };
      Object.keys(extra).forEach(function(k) { message[k] = extra[k]; });
      RENDERACTOR.send(message);
    });
  };
}

var enqueuerender = createEnqueuer(MESSAGETYPES.RENDER, true, function(rest) { return { renderer: rest[0], data: rest[1], env: rest[2] }; });
var enqueueclear = createEnqueuer(MESSAGETYPES.CLEAR, true);
var enqueuehtml = createEnqueuer(MESSAGETYPES.HTML, true, function(rest) { return { markup: rest[0], append: rest[1] }; });
var enqueueremove = createEnqueuer(MESSAGETYPES.REMOVE, true);
var enqueuestyles = createEnqueuer(MESSAGETYPES.SETSTYLES, true, function(rest) { return { styles: rest[0] }; });
var enqueuesetattr = createEnqueuer(MESSAGETYPES.SETATTR, true, function(rest) { return { name: rest[0], value: rest[1] }; });
var enqueuetoggleclass = createEnqueuer(MESSAGETYPES.TOGGLECLASS, true, function(rest) { return { classname: rest[0], force: rest[1] }; });
var enqueuecreateelement = createEnqueuer(MESSAGETYPES.CREATEELEMENT, false, function(rest) { return { tag: rest[0], props: rest[1] }; });
var enqueuecreatecontainer = createEnqueuer(MESSAGETYPES.CREATECONTAINER, false);
var enqueuecreatefromhtml = createEnqueuer(MESSAGETYPES.CREATEFROMHTML, false, function(rest) { return { html: rest[0] }; });
var enqueuegethtml = createEnqueuer(MESSAGETYPES.GETHTML, true);
var enqueuegetvalue = createEnqueuer(MESSAGETYPES.GETVALUE, true);
var enqueuegetstyle = createEnqueuer(MESSAGETYPES.GETSTYLE, true);
var enqueuegetposition = createEnqueuer(MESSAGETYPES.GETPOSITION, true);
var enqueuesethtml = createEnqueuer(MESSAGETYPES.SETHTML, true, function(rest) { return { value: rest[0] }; });
var enqueuesetposition = createEnqueuer(MESSAGETYPES.SETPOSITION, true, function(rest) { return { value: rest[0] }; });
var enqueuesetstyle = createEnqueuer(MESSAGETYPES.SETSTYLE, true, function(rest) { return { value: rest[0] }; });
var enqueuesetvalue = createEnqueuer(MESSAGETYPES.SETVALUE, true, function(rest) { return { value: rest[0] }; });
var enqueueproperty = createEnqueuer(MESSAGETYPES.PROPERTY, true, function(rest) { return { name: rest[0], arguments: rest[1] }; });
var enqueuegetlayout = createEnqueuer(MESSAGETYPES.GETLAYOUT, true);
var enqueusetlayout = createEnqueuer(MESSAGETYPES.SETLAYOUT, true, function(rest) { return { value: rest[0] }; });
var enqueuegetviewport = createEnqueuer(MESSAGETYPES.GETVIEWPORT, false);
var enqueuegetscreen = createEnqueuer(MESSAGETYPES.GETSCREEN, false);
var enqueuematchmedia = createEnqueuer(MESSAGETYPES.MATCHMEDIA, false, function(rest) { return { query: rest[0] }; });

var DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
var DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
var DOMQUERYMESSAGES = Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS));

var expectelement = function(id, timeout) {
  if (timeout === undefined) timeout = 30000;
  return new Promise(function(resolve, reject) {
    var existing = document.getElementById(id);
    if (existing) return resolve(CREATEDOMREF(existing, initialState.actorRegistry));

    var observer = null;
    var timeoutid = setTimeout(function() {
      if (observer) observer.disconnect();
      reject(new Error('[expectelement] element not found: ' + id));
    }, timeout);

    observer = new MutationObserver(function() {
      var el = document.getElementById(id);
      if (el) {
        clearTimeout(timeoutid);
        observer.disconnect();
        resolve(CREATEDOMREF(el, initialState.actorRegistry));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
};

var handlefilereaderrequest = function(payload) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) { resolve({ text: e.target.result }); };
    reader.onerror = function() { reject(new Error('[renderactor] FileReader error')); };
    reader.readAsText(payload.file);
  });
};

var enqueueRenderGetBodyHtml = function() {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.GET_BODY_HTML, resolve: resolve, reject: reject });
  });
};

var enqueueRenderRestoreBodyHtml = function(html) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.RESTORE_BODY_HTML, html: html, resolve: resolve, reject: reject });
  });
};

var enqueueRenderRecover = function() {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.RECOVER, resolve: resolve, reject: reject });
  });
};

export {
  RENDERACTOR,
  MESSAGETYPES,
  enqueuerender,
  enqueueclear,
  enqueuehtml,
  enqueueremove,
  enqueuestyles,
  enqueuesetattr,
  enqueuetoggleclass,
  enqueuecreateelement,
  enqueuecreatecontainer,
  enqueuecreatefromhtml,
  enqueuegethtml,
  enqueuegetvalue,
  enqueuegetstyle,
  enqueuegetposition,
  enqueuesethtml,
  enqueuesetposition,
  enqueuesetstyle,
  enqueuesetvalue,
  enqueueproperty,
  enqueuegetlayout,
  enqueusetlayout,
  enqueuegetviewport,
  enqueuegetscreen,
  enqueuematchmedia,
  DOMQUERYGETTERS,
  DOMQUERYSETTERS,
  DOMQUERYMESSAGES,
  expectelement,
  handlefilereaderrequest,
  enqueueRenderGetBodyHtml,
  enqueueRenderRestoreBodyHtml,
  enqueueRenderRecover
};
