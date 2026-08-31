// ============================================================
// UPDATED FILE: js/actors/renderactor.js
// Change applied: FINAL SWEEP
//   - No self-registration (moved to registerconsumers.js)
//   - createactor receives renderactorINTERFACES directly
//   - enqueue* functions fire-and-forget, accept optional responseSpec
//   - enqueuesetlayout typo corrected
// ============================================================


var renderVerbosityConstants = createVerbosityConstants();
var renderState = Object.freeze({ level: renderVerbosityConstants.DEBUG });

function createRenderErrorContext(label) {
  return function(err) {
    if (!err) err = new Error('unknown render error');
    if (!err.diagnostic) err.diagnostic = {};
    err.diagnostic.renderstage = label;
    throw err;
  };
}

function createInitialRenderWorldmap() {
  return { html: '', viewport: null };
}

function persistRenderWorldmap(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.worldmap || typeof state.worldmap !== 'object') {
    state.worldmap = createInitialRenderWorldmap();
  }
  state.worldmap.html = (typeof document !== 'undefined' && document.body) ? document.body.innerHTML : '';
  enqueueDbStore('actor:state:render', state.worldmap).catch(function(e) {
    logwarn(renderState, '[RENDERACTOR]', 'state persist failed:', e);
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

function withElementRetry(id, reject, fn, timeout) {
  if (timeout === undefined) timeout = 5000;
  var existing = document.getElementById(id);
  if (existing) return fn(existing);
  return new Promise(function(resolve, rejectPromise) {
    var observer = null;
    var timeoutId = setTimeout(function() {
      if (observer) observer.disconnect();
      rejectPromise(new Error('[RENDERACTOR] element not found after timeout: ' + id));
    }, timeout);
    observer = new MutationObserver(function() {
      var el = document.getElementById(id);
      if (el) {
        clearTimeout(timeoutId);
        observer.disconnect();
        try { resolve(fn(el)); } catch (err) { rejectPromise(err); }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function waitForDomReady() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.readyState === 'loading') {
    return new Promise(function(resolve) { document.addEventListener('DOMContentLoaded', resolve, { once: true }); });
  }
  if (document.readyState !== 'complete') {
    return new Promise(function(resolve) { window.addEventListener('load', resolve, { once: true }); });
  }
  return Promise.resolve();
}

function createTriggerProducerConsumer(msg) {
  return {
    producer: { type: 'dom-event', id: msg.sourceid, event: msg.event },
    consumer: { type: 'trigger-recipient', pipelineId: msg.pipelineId, stageId: msg.stageId },
    metadata: { stagePath: msg.stagePath || [], control: msg.control, children: msg.children, env: msg.env || {} }
  };
}

function scheduleGcCycle(state) {
  if (!state) return;
  if (state._triggerGcScheduled) return;
  state._triggerGcScheduled = true;
  setTimeout(function() {
    state._triggerGcScheduled = false;
    if (state._gc) {
      collectEnded(state._gc);
    }
  }, 0);
}

function ensureTriggerObserver(state) {
  if (!state || state._triggerObserverInstalled) return;
  if (typeof document === 'undefined') return;
  state._triggerObserverInstalled = true;

  var handler = function(event) {
    var target = event.target;
    var targetId = target && target.id;
    if (!targetId || !state._gc) return;

    listObjects(state._gc).forEach(function(gcObj) {
      var producer = gcObj.producer || {};
      if (producer.type !== 'dom-event') return;
      if (producer.id !== targetId) return;
      if (producer.event !== event.type) return;

      incrementSent(state._gc, gcObj.id, 1);

      sendInstruction('hypervisoractor', 'trigger_event', {
        pipelineId: gcObj.consumer && gcObj.consumer.pipelineId,
        stageId: gcObj.consumer && gcObj.consumer.stageId,
        stagePath: gcObj.metadata && gcObj.metadata.stagePath ? gcObj.metadata.stagePath : [],
        eventPayload: { type: event.type, targetId: targetId }
      }, null, 'renderactor');
    });
  };

  document.addEventListener('click', handler, true);
  document.addEventListener('input', handler, true);
  document.addEventListener('change', handler, true);
}

var HANDLERS = {};
HANDLERS[MESSAGETYPES.RENDER] = function(state, msg) {
  var target = msg.id ? document.getElementById(msg.id) : null;
  if (typeof msg.renderer === 'function') {
    try { msg.renderer(target, msg.data, msg.env || {}); } catch (err) { console.error('[RENDERACTOR] Renderer error:', err); throw err; }
  }
  return true;
};
HANDLERS[MESSAGETYPES.CLEAR] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, null, function(el) { el.innerHTML = ''; });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.HTML] = function(state, msg) {
  return waitForDomReady().then(function() {
    persistRenderWorldmap(state);
    withElementRetry(msg.id, null, function(el) {
      if (msg.append) el.insertAdjacentHTML('beforeend', msg.markup);
      else el.innerHTML = msg.markup;
    });
    persistRenderWorldmap(state);
    return true;
  });
};
HANDLERS[MESSAGETYPES.REMOVE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElement(msg.id, null, function(el) { el.remove(); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.SETSTYLES] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) {
    Object.keys(msg.styles || {}).forEach(function(prop) { el.style[prop] = msg.styles[prop]; });
  });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.SETATTR] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { el.setAttribute(msg.name, msg.value); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { el.classList.toggle(msg.classname, msg.force); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.CRYPTO] = function(state, msg) {
  var win = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var array = new Uint8Array(msg.bytes);
  win.crypto.getRandomValues(array);
  return Array.prototype.slice.call(array);
};
HANDLERS[MESSAGETYPES.GEOLOCATION] = function(state, msg) {
  return new Promise(function(resolve, reject) {
    var win = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
    var geo = win.navigator && win.navigator.geolocation;
    if (!geo) return reject(new Error('geolocation API unavailable'));
    geo.getCurrentPosition(
      function(pos) { resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
      function(err) { reject(new Error('geolocation failed: ' + err.message)); },
      { enablehighaccuracy: msg.enablehighaccuracy || false, timeout: msg.timeout || 5000 }
    );
  });
};
HANDLERS[MESSAGETYPES.PERSISTENCE] = function(state, msg) {
  var win = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var storage = win.localStorage;
  if (!storage) return { error: 'localStorage unavailable' };
  try {
    if (msg.action === 'getItem') return { value: storage.getItem(msg.key) };
    else if (msg.action === 'setItem') { storage.setItem(msg.key, msg.value); return { success: true }; }
    else if (msg.action === 'removeItem') { storage.removeItem(msg.key); return { success: true }; }
    else if (msg.action === 'clear') { storage.clear(); return { success: true }; }
    else return { error: 'unknown persistence action: ' + msg.action };
  } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.CREATEELEMENT] = function(state, msg) {
  persistRenderWorldmap(state);
  try {
    var el = document.createElement(msg.tag);
    if (msg.props) Object.keys(msg.props).forEach(function(prop) { el[prop] = msg.props[prop]; });
    return CREATEDOMREF(el, state.actorRegistry);
  } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(state, msg) {
  persistRenderWorldmap(state);
  try { return CREATEDOMREF(document.createElement('div'), state.actorRegistry); } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(state, msg) {
  persistRenderWorldmap(state);
  try {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = msg.html;
    var child = wrapper.firstElementChild || wrapper;
    return CREATEDOMREF(child, state.actorRegistry);
  } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.PROPERTY] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var fn = el[msg.name];
  if (typeof fn !== 'function') return { error: 'property "' + msg.name + '" is not a function' };
  try { return fn.apply(el, msg.arguments || []); } catch (e) { return { error: e.message }; }
};
HANDLERS[MESSAGETYPES.GETHTML] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return { tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML };
};
HANDLERS[MESSAGETYPES.GETVALUE] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return el.value;
};
HANDLERS[MESSAGETYPES.GETSTYLE] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var computed = window.getComputedStyle(el);
  var styleobj = Array.prototype.slice.call(computed).reduce(function(acc, prop) {
    acc[prop] = computed.getPropertyValue(prop);
    return acc;
  }, {});
  return styleobj;
};
HANDLERS[MESSAGETYPES.GETPOSITION] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
};
HANDLERS[MESSAGETYPES.GETLAYOUT] = function(state, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return {
    offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight,
    offsetLeft: el.offsetLeft, offsetTop: el.offsetTop,
    scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
    clientWidth: el.clientWidth, clientHeight: el.clientHeight
  };
};
HANDLERS[MESSAGETYPES.SETHTML] = function(state, msg) {
  return waitForDomReady().then(function() {
    persistRenderWorldmap(state);
    withElementRetry(msg.id, null, function(el) { el.innerHTML = msg.value; });
    persistRenderWorldmap(state);
    return true;
  });
};
HANDLERS[MESSAGETYPES.SETPOSITION] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el.style[prop] = msg.value[prop]; }); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.SETSTYLE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el.style[prop] = msg.value[prop]; }); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.SETVALUE] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { el.value = msg.value; });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.SETLAYOUT] = function(state, msg) {
  persistRenderWorldmap(state);
  withElementRetry(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el[prop] = msg.value[prop]; }); });
  persistRenderWorldmap(state);
  return true;
};
HANDLERS[MESSAGETYPES.GETVIEWPORT] = function(state, msg) {
  var doc = document.documentElement;
  return { viewportWidth: doc.clientWidth, viewportHeight: doc.clientHeight };
};
HANDLERS[MESSAGETYPES.GETSCREEN] = function(state, msg) {
  var scr = window.screen;
  return { screenWidth: scr.width, screenHeight: scr.height, availWidth: scr.availWidth, availHeight: scr.availHeight };
};
HANDLERS[MESSAGETYPES.MATCHMEDIA] = function(state, msg) {
  return { matches: window.matchMedia(msg.query).matches };
};
HANDLERS[MESSAGETYPES.GET_BODY_HTML] = function(state, msg) {
  return document.body ? document.body.innerHTML : '';
};
HANDLERS[MESSAGETYPES.RESTORE_BODY_HTML] = function(state, msg) {
  return waitForDomReady().then(function() {
    persistRenderWorldmap(state);
    if (document.body) document.body.innerHTML = msg.html;
    persistRenderWorldmap(state);
    return true;
  });
};
HANDLERS[MESSAGETYPES.RECOVER] = function(state, msg) {
  return waitForDomReady().then(function() {
    return enqueueDbRestore('actor:state:render').then(function(saved) {
      if (saved) {
        state.worldmap = saved;
        if (document.body) document.body.innerHTML = saved.html;
      } else {
        state.worldmap = createInitialRenderWorldmap();
        persistRenderWorldmap(state);
      }
      scheduleGcCycle(state);
    }).catch(function(e) {
      state.worldmap = createInitialRenderWorldmap();
      persistRenderWorldmap(state);
    }).then(function() {
      return state;
    });
  });
};
HANDLERS[MESSAGETYPES.PING] = function(state, msg) { return true; };
HANDLERS[MESSAGETYPES.REGISTER_TRIGGER] = function(state, msg) {
  return HANDLERS[MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION](state, msg);
};
HANDLERS[MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION] = function(state, msg) {
  var pc = createTriggerProducerConsumer(msg);
  var existing = listObjects(state._gc).filter(function(obj) {
    return obj.producer.id === pc.producer.id && obj.producer.event === pc.producer.event &&
      obj.consumer.pipelineId === pc.consumer.pipelineId && obj.consumer.stageId === pc.consumer.stageId;
  })[0];
  if (existing) {
    existing.metadata = pc.metadata; existing.status = 'EXPECTING'; existing.sentCount = 0; existing.receivedCount = 1;
  } else {
    var gcObject = { producer: pc.producer, consumer: pc.consumer, metadata: pc.metadata, status: 'EXPECTING', sentCount: 0, receivedCount: 0 };
    registerObject(state._gc, gcObject);
    incrementReceived(state._gc, gcObject.id, 1);
    ensureTriggerObserver(state);
  }
  scheduleGcCycle(state);
  return true;
};
HANDLERS[MESSAGETYPES.REVALIDATE_TRIGGERS] = function(state, msg) { scheduleGcCycle(state); return true; };

var renderbehavior = function(state, message) {
  var v = state && state.verbosity !== undefined ? state.verbosity : renderVerbosityConstants.DEBUG;
  renderState = Object.freeze({ level: v });
  logdebug(renderState, '[RENDERACTOR]', 'behavior handling action:', message.type, message.id || '');
  var handler = HANDLERS[message.type];
  if (handler) {
    var result = handler(state, message);
    if (result && typeof result.then === 'function') {
      return result;
    }
    return result;
  }
  return state;
};

var renderInitialState = {
  actorRegistry: createActorRegistry(),
  worldmap: createInitialRenderWorldmap(),
  _gc: createGarbageCollector(),
  _triggerGcScheduled: false,
  _gcCycleRunning: false,
  _gcCycleQueued: false,
  _triggerObserverInstalled: false,
  verbosity: renderVerbosityConstants.DEBUG
};

var renderactorINTERFACES = {};
renderactorINTERFACES[MESSAGETYPES.RENDER] = { id: 'string', renderer: 'function', data: 'any', env: 'object' };
renderactorINTERFACES[MESSAGETYPES.CLEAR] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.HTML] = { id: 'string', markup: 'string', append: 'boolean' };
renderactorINTERFACES[MESSAGETYPES.REMOVE] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.SETSTYLES] = { id: 'string', styles: 'object' };
renderactorINTERFACES[MESSAGETYPES.SETATTR] = { id: 'string', name: 'string', value: 'string' };
renderactorINTERFACES[MESSAGETYPES.TOGGLECLASS] = { id: 'string', classname: 'string', force: 'boolean?' };
renderactorINTERFACES[MESSAGETYPES.CRYPTO] = { bytes: 'number' };
renderactorINTERFACES[MESSAGETYPES.GEOLOCATION] = { enablehighaccuracy: 'boolean', timeout: 'number' };
renderactorINTERFACES[MESSAGETYPES.PERSISTENCE] = { action: 'string', key: 'string?', value: 'string?' };
renderactorINTERFACES[MESSAGETYPES.CREATEELEMENT] = { tag: 'string', props: 'object?' };
renderactorINTERFACES[MESSAGETYPES.CREATECONTAINER] = {};
renderactorINTERFACES[MESSAGETYPES.CREATEFROMHTML] = { html: 'string' };
renderactorINTERFACES[MESSAGETYPES.PROPERTY] = { id: 'string', name: 'string', arguments: 'array?' };
renderactorINTERFACES[MESSAGETYPES.GETHTML] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.GETVALUE] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.GETSTYLE] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.GETPOSITION] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.GETLAYOUT] = { id: 'string' };
renderactorINTERFACES[MESSAGETYPES.SETHTML] = { id: 'string', value: 'string' };
renderactorINTERFACES[MESSAGETYPES.SETPOSITION] = { id: 'string', value: 'object' };
renderactorINTERFACES[MESSAGETYPES.SETSTYLE] = { id: 'string', value: 'object' };
renderactorINTERFACES[MESSAGETYPES.SETVALUE] = { id: 'string', value: 'any' };
renderactorINTERFACES[MESSAGETYPES.SETLAYOUT] = { id: 'string', value: 'object' };
renderactorINTERFACES[MESSAGETYPES.GETVIEWPORT] = {};
renderactorINTERFACES[MESSAGETYPES.GETSCREEN] = {};
renderactorINTERFACES[MESSAGETYPES.MATCHMEDIA] = { query: 'string' };
renderactorINTERFACES[MESSAGETYPES.GET_BODY_HTML] = {};
renderactorINTERFACES[MESSAGETYPES.RESTORE_BODY_HTML] = { html: 'string' };
renderactorINTERFACES[MESSAGETYPES.RECOVER] = {};
renderactorINTERFACES[MESSAGETYPES.PING] = {};
renderactorINTERFACES[MESSAGETYPES.REGISTER_TRIGGER] = { pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array' };
renderactorINTERFACES[MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION] = { pipelineId: 'string', stageId: 'string', stagePath: 'array', sourceid: 'string', event: 'string', control: 'object', children: 'array', output: 'string?' };
renderactorINTERFACES[MESSAGETYPES.REVALIDATE_TRIGGERS] = {};
Object.freeze(renderactorINTERFACES);

// NOTE: No MESSAGEREGISTRY.register loop. Centralized in registerconsumers.js.

var RENDERACTOR = createactor(
  renderbehavior,
  renderInitialState,
  renderactorINTERFACES,
  {
    actorName: 'renderactor',
    mailboxType: 'mail',
    verbosity: renderVerbosityConstants.DEBUG
  }
);

renderInitialState.actorRegistry = setRenderActor(renderInitialState.actorRegistry, RENDERACTOR);
ensureTriggerObserver(renderInitialState);

function createEnqueuer(type, idRequired, extraPayloadFn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var id, rest;
    if (idRequired) { id = args[0]; rest = args.slice(1); } else { id = undefined; rest = args; }
    var tag = generateTag();
    var payload = idRequired ? { id: id } : {};
    if (extraPayloadFn) {
      var extra = extraPayloadFn(rest);
      Object.keys(extra).forEach(function(key) { payload[key] = extra[key]; });
    }
    var responseSpec = undefined;
    if (arguments.length > 0) {
      var lastArg = arguments[arguments.length - 1];
      if (lastArg && typeof lastArg === 'object' && lastArg.responseType) {
        responseSpec = lastArg;
      }
    }
    sendInstruction('renderactor', type, payload, tag, 'system', responseSpec);
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
var enqueuegetlayout = createEnqueuer(MESSAGETYPES.GETLAYOUT, true);
var enqueuesethtml = createEnqueuer(MESSAGETYPES.SETHTML, true, function(rest) { return { value: rest[0] }; });
var enqueuesetposition = createEnqueuer(MESSAGETYPES.SETPOSITION, true, function(rest) { return { value: rest[0] }; });
var enqueuesetstyle = createEnqueuer(MESSAGETYPES.SETSTYLE, true, function(rest) { return { value: rest[0] }; });
var enqueuesetvalue = createEnqueuer(MESSAGETYPES.SETVALUE, true, function(rest) { return { value: rest[0] }; });
var enqueueproperty = createEnqueuer(MESSAGETYPES.PROPERTY, true, function(rest) { return { name: rest[0], arguments: rest[1] }; });
var enqueuesetlayout = createEnqueuer(MESSAGETYPES.SETLAYOUT, true, function(rest) { return { value: rest[0] }; });
var enqueuegetviewport = createEnqueuer(MESSAGETYPES.GETVIEWPORT, false);
var enqueuegetscreen = createEnqueuer(MESSAGETYPES.GETSCREEN, false);
var enqueuematchmedia = createEnqueuer(MESSAGETYPES.MATCHMEDIA, false, function(rest) { return { query: rest[0] }; });
var enqueueRenderRegisterTrigger = function(registration, responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.REGISTER_TRIGGER, registration, tag, 'system', responseSpec);
};
var enqueueRenderRegisterTriggerExpectation = function(registration, responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION, registration, tag, 'system', responseSpec);
};
var enqueueRenderRevalidateTriggers = function(responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.REVALIDATE_TRIGGERS, {}, tag, 'system', responseSpec);
};
var enqueueRenderPing = function(responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.PING, {}, tag, 'system', responseSpec);
};
var enqueueRenderGetBodyHtml = function(responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.GET_BODY_HTML, {}, tag, 'system', responseSpec);
};
var enqueueRenderRestoreBodyHtml = function(html, responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.RESTORE_BODY_HTML, { html: html }, tag, 'system', responseSpec);
};
var enqueueRenderRecover = function(responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.RECOVER, {}, tag, 'system', responseSpec);
};
var enqueueRenderCrypto = function(bytes, responseSpec) {
  var tag = generateTag();
  sendInstruction('renderactor', MESSAGETYPES.CRYPTO, { bytes: bytes }, tag, 'system', responseSpec);
};

var startRenderActor = function(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options : (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      renderState = Object.freeze({ level: lvl });
      if (RENDERACTOR && RENDERACTOR.getstate()) {
        RENDERACTOR.getstate().verbosity = lvl;
      }
    }
  }
  return RENDERACTOR;
};

var expectelement = function(id, timeout) {
  if (timeout === undefined) timeout = 30000;
  return new Promise(function(resolve, reject) {
    var existing = document.getElementById(id);
    if (existing) return resolve(CREATEDOMREF(existing, renderInitialState.actorRegistry));
    var observer = null;
    var timeoutid = setTimeout(function() { if (observer) observer.disconnect(); reject(new Error('[expectelement] element not found: ' + id)); }, timeout);
    observer = new MutationObserver(function() {
      var el = document.getElementById(id);
      if (el) { clearTimeout(timeoutid); observer.disconnect(); resolve(CREATEDOMREF(el, renderInitialState.actorRegistry)); }
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
