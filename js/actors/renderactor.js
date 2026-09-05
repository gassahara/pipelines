var RENDERVERBOSITYCONSTANTS = createVerbosityConstants();

function ENSURERENDERSLICE(env) {
  return ENSUREENVSLICE(env, 'render', function() {
    return {
      html: '',
      viewport: null,
      actorRegistry: null
    };
  });
}

function CREATERENDERERRORCONTEXT(label) {
  return function(err) {
    if (!err) err = new Error('unknown render error');
    if (!err.diagnostic) err.diagnostic = {};
    err.diagnostic.renderstage = label;
    throw err;
  };
}

function WITHELEMENT(id, reject, fn) {
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

function WITHELEMENTRETRY(id, reject, fn, timeout) {
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

function WAITFORDOMREADY() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.readyState === 'loading') {
    return new Promise(function(resolve) { document.addEventListener('DOMContentLoaded', resolve, { once: true }); });
  }
  if (document.readyState !== 'complete') {
    return new Promise(function(resolve) { window.addEventListener('load', resolve, { once: true }); });
  }
  return Promise.resolve();
}

function CREATETRIGGERPRODUCERCONSUMER(msg) {
  return {
    producer: { type: 'dom-event', id: msg.sourceid, event: msg.event },
    consumer: { type: 'trigger-recipient', pipelineId: msg.pipelineId, stageId: msg.stageId },
    metadata: { stagePath: msg.stagePath || [], control: msg.control, children: msg.children, env: msg.env || {} }
  };
}

function SCHEDULEGCCYCLE(renderSlice) {
  if (!renderSlice) return;
  if (renderSlice._triggerGcScheduled) return;
  renderSlice._triggerGcScheduled = true;
  setTimeout(function() {
    renderSlice._triggerGcScheduled = false;
    if (renderSlice._gc) {
      collectEnded(renderSlice._gc);
    }
  }, 0);
}

function ENSURETRIGGEROBSERVER(renderSlice) {
  if (!renderSlice || renderSlice._triggerObserverInstalled) return;
  if (typeof document === 'undefined') return;
  renderSlice._triggerObserverInstalled = true;

  var handler = function(event) {
    var target = event.target;
    var targetId = target && target.id;
    if (!targetId || !renderSlice._gc) return;

    listObjects(renderSlice._gc).forEach(function(gcObj) {
      var producer = gcObj.producer || {};
      if (producer.type !== 'dom-event') return;
      if (producer.id !== targetId) return;
      if (producer.event !== event.type) return;

      incrementSent(renderSlice._gc, gcObj.id, 1);

      SENDINSTRUCTION('HYPERVISORACTOR', 'trigger_event', {
        pipelineId: gcObj.consumer && gcObj.consumer.pipelineId,
        stageId: gcObj.consumer && gcObj.consumer.stageId,
        stagePath: gcObj.metadata && gcObj.metadata.stagePath ? gcObj.metadata.stagePath : [],
        eventPayload: { type: event.type, targetId: targetId }
      }, null, 'RENDERACTOR');
    });
  };

  document.addEventListener('click', handler, true);
  document.addEventListener('input', handler, true);
  document.addEventListener('change', handler, true);
}

var HANDLERS = {};
HANDLERS[MESSAGETYPES.RENDER] = function(env, msg) {
  var target = msg.id ? document.getElementById(msg.id) : null;
  if (typeof msg.renderer === 'function') {
    try { msg.renderer(target, msg.data, msg.env || {}); } catch (err) { console.error('[RENDERACTOR] Renderer error:', err); throw err; }
  }
  return true;
};
HANDLERS[MESSAGETYPES.CLEAR] = function(env, msg) {
  WITHELEMENT(msg.id, null, function(el) { el.innerHTML = ''; });
  return true;
};
HANDLERS[MESSAGETYPES.HTML] = function(env, msg) {
  WAITFORDOMREADY().then(function() {
    WITHELEMENTRETRY(msg.id, null, function(el) {
      if (msg.append) el.insertAdjacentHTML('beforeend', msg.markup);
      else el.innerHTML = msg.markup;
    });
    RESPONDIFNEEDED(env, msg, true);
  }).catch(function(err) {
    RESPONDIFNEEDED(env, msg, { error: err.message || String(err) });
  });
};
HANDLERS[MESSAGETYPES.REMOVE] = function(env, msg) {
  WITHELEMENT(msg.id, null, function(el) { el.remove(); });
  return true;
};
HANDLERS[MESSAGETYPES.SETSTYLES] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) {
    Object.keys(msg.styles || {}).forEach(function(prop) { el.style[prop] = msg.styles[prop]; });
  });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.SETATTR] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { el.setAttribute(msg.name, msg.value); });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.TOGGLECLASS] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { el.classList.toggle(msg.classname, msg.force); });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.CRYPTO] = function(env, msg) {
  var win = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var array = new Uint8Array(msg.bytes);
  win.crypto.getRandomValues(array);
  return Array.prototype.slice.call(array);
};
HANDLERS[MESSAGETYPES.GEOLOCATION] = function(env, msg) {
  var win = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : null));
  var geo = win.navigator && win.navigator.geolocation;
  if (!geo) {
    RESPONDIFNEEDED(env, msg, { error: 'geolocation API unavailable' });
    return;
  }
  geo.getCurrentPosition(
    function(pos) { RESPONDIFNEEDED(env, msg, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
    function(err) { RESPONDIFNEEDED(env, msg, { error: 'geolocation failed: ' + err.message }); },
    { enablehighaccuracy: msg.enablehighaccuracy || false, timeout: msg.timeout || 5000 }
  );
};
HANDLERS[MESSAGETYPES.PERSISTENCE] = function(env, msg) {
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
HANDLERS[MESSAGETYPES.CREATEELEMENT] = function(env, msg) {
  try {
    var el = document.createElement(msg.tag);
    if (msg.props) Object.keys(msg.props).forEach(function(prop) { el[prop] = msg.props[prop]; });
    return CREATEDOMREF(el, env.render.actorRegistry);
  } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.CREATECONTAINER] = function(env, msg) {
  try { return CREATEDOMREF(document.createElement('div'), env.render.actorRegistry); } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.CREATEFROMHTML] = function(env, msg) {
  try {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = msg.html;
    var child = wrapper.firstElementChild || wrapper;
    return CREATEDOMREF(child, env.render.actorRegistry);
  } catch (err) { return { error: err.message }; }
};
HANDLERS[MESSAGETYPES.PROPERTY] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var fn = el[msg.name];
  if (typeof fn !== 'function') return { error: 'property "' + msg.name + '" is not a function' };
  try { return fn.apply(el, msg.arguments || []); } catch (e) { return { error: e.message }; }
};
HANDLERS[MESSAGETYPES.GETHTML] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return { tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML };
};
HANDLERS[MESSAGETYPES.GETVALUE] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return el.value;
};
HANDLERS[MESSAGETYPES.GETSTYLE] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var computed = window.getComputedStyle(el);
  var styleobj = Array.prototype.slice.call(computed).reduce(function(acc, prop) {
    acc[prop] = computed.getPropertyValue(prop);
    return acc;
  }, {});
  return styleobj;
};
HANDLERS[MESSAGETYPES.GETPOSITION] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  var rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
};
HANDLERS[MESSAGETYPES.GETLAYOUT] = function(env, msg) {
  var el = document.getElementById(msg.id);
  if (!el) return { error: 'element not found: ' + msg.id };
  return {
    offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight,
    offsetLeft: el.offsetLeft, offsetTop: el.offsetTop,
    scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
    clientWidth: el.clientWidth, clientHeight: el.clientHeight
  };
};
HANDLERS[MESSAGETYPES.SETHTML] = function(env, msg) {
  WAITFORDOMREADY().then(function() {
    WITHELEMENTRETRY(msg.id, null, function(el) { el.innerHTML = msg.value; });
    RESPONDIFNEEDED(env, msg, true);
  }).catch(function(err) {
    RESPONDIFNEEDED(env, msg, { error: err.message || String(err) });
  });
};
HANDLERS[MESSAGETYPES.SETPOSITION] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el.style[prop] = msg.value[prop]; }); });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.SETSTYLE] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el.style[prop] = msg.value[prop]; }); });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.SETVALUE] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { el.value = msg.value; });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.SETLAYOUT] = function(env, msg) {
  WITHELEMENTRETRY(msg.id, null, function(el) { Object.keys(msg.value || {}).forEach(function(prop) { el[prop] = msg.value[prop]; }); });
  RESPONDIFNEEDED(env, msg, true);
};
HANDLERS[MESSAGETYPES.GETVIEWPORT] = function(env, msg) {
  var doc = document.documentElement;
  return { viewportWidth: doc.clientWidth, viewportHeight: doc.clientHeight };
};
HANDLERS[MESSAGETYPES.GETSCREEN] = function(env, msg) {
  var scr = window.screen;
  return { screenWidth: scr.width, screenHeight: scr.height, availWidth: scr.availWidth, availHeight: scr.availHeight };
};
HANDLERS[MESSAGETYPES.MATCHMEDIA] = function(env, msg) {
  return { matches: window.matchMedia(msg.query).matches };
};
HANDLERS[MESSAGETYPES.GET_BODY_HTML] = function(env, msg) {
  return document.body ? document.body.innerHTML : '';
};
HANDLERS[MESSAGETYPES.RESTORE_BODY_HTML] = function(env, msg) {
  WAITFORDOMREADY().then(function() {
    if (document.body) document.body.innerHTML = msg.html;
    RESPONDIFNEEDED(env, msg, true);
  }).catch(function(err) {
    RESPONDIFNEEDED(env, msg, { error: err.message || String(err) });
  });
};
HANDLERS[MESSAGETYPES.RECOVER] = function(env, msg) {
  WAITFORDOMREADY().then(function() {
    return DBRESTORE('actor:state:render').then(function(saved) {
      if (saved !== null && saved !== undefined) {
        env.render = saved;
      } else {
        env.render = { html: '', viewport: null, actorRegistry: null };
      }
      SCHEDULEGCCYCLE(env.render);
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'render', value: env.render }]
      }, GENERATETAG(), 'RENDERACTOR');
      RESPONDIFNEEDED(env, msg, env);
    }).catch(function(e) {
      env.render = { html: '', viewport: null, actorRegistry: null };
      SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
        updates: [{ path: 'render', value: env.render }]
      }, GENERATETAG(), 'RENDERACTOR');
      RESPONDIFNEEDED(env, msg, { error: e.message || String(e) });
    });
  }).catch(function(err) {
    RESPONDIFNEEDED(env, msg, { error: err.message || String(err) });
  });
};
HANDLERS[MESSAGETYPES.PING] = function(env, msg) { return true; };
HANDLERS[MESSAGETYPES.REGISTER_TRIGGER] = function(env, msg) {
  return HANDLERS[MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION](env, msg);
};
HANDLERS[MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION] = function(env, msg) {
  var pc = CREATETRIGGERPRODUCERCONSUMER(msg);
  var existing = listObjects(env.render._gc).filter(function(obj) {
    return obj.producer.id === pc.producer.id && obj.producer.event === pc.producer.event &&
      obj.consumer.pipelineId === pc.consumer.pipelineId && obj.consumer.stageId === pc.consumer.stageId;
  })[0];
  if (existing) {
    existing.metadata = pc.metadata; existing.status = 'EXPECTING'; existing.sentCount = 0; existing.receivedCount = 1;
  } else {
    var gcObject = { producer: pc.producer, consumer: pc.consumer, metadata: pc.metadata, status: 'EXPECTING', sentCount: 0, receivedCount: 0 };
    registerObject(env.render._gc, gcObject);
    incrementReceived(env.render._gc, gcObject.id, 1);
    ENSURETRIGGEROBSERVER(env.render);
  }
  SCHEDULEGCCYCLE(env.render);
  SENDINSTRUCTION('WORLDMAPACTOR', MESSAGETYPES.UPDATE, {
    updates: [{ path: 'render', value: env.render }]
  }, GENERATETAG(), 'RENDERACTOR');
  return true;
};
HANDLERS[MESSAGETYPES.REVALIDATE_TRIGGERS] = function(env, msg) {
  SCHEDULEGCCYCLE(env.render);
  return true;
};

function RESPONDIFNEEDED(env, message, result) {
  if (message.sender && message.tag) {
    var responseType = (message.responseSpec && message.responseSpec.responseType) || MESSAGETYPES.DOM_RESULT;
    SENDRESPONSE(message.sender, message.tag, result, 'RENDERACTOR', responseType);
  }
}

// Pure behavior function: (env, message) -> env
function RENDERBEHAVIOR(env, message) {
  logdebug(env, '[RENDERACTOR]', 'behavior handling action:', message.type, message.id || '');
  var renderSlice = ENSURERENDERSLICE(env);
  var handler = HANDLERS[message.type];
  if (handler) {
    var result = handler(env, message);
    if (result !== undefined) {
      RESPONDIFNEEDED(env, message, result);
    }
  }
  return env;
}

function CREATEENQUEUER(type, idRequired, extraPayloadFn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var id, rest;
    if (idRequired) { id = args[0]; rest = args.slice(1); } else { id = undefined; rest = args; }
    var tag = GENERATETAG();
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
    SENDINSTRUCTION('RENDERACTOR', type, payload, tag, 'system', responseSpec);
  };
}

var ENQUEUERENDER = CREATEENQUEUER(MESSAGETYPES.RENDER, true, function(rest) { return { renderer: rest[0], data: rest[1], env: rest[2] }; });
var ENQUEUECLEAR = CREATEENQUEUER(MESSAGETYPES.CLEAR, true);
var ENQUEUEHTML = CREATEENQUEUER(MESSAGETYPES.HTML, true, function(rest) { return { markup: rest[0], append: rest[1] }; });
var ENQUEUEREMOVE = CREATEENQUEUER(MESSAGETYPES.REMOVE, true);
var ENQUEUESTYLES = CREATEENQUEUER(MESSAGETYPES.SETSTYLES, true, function(rest) { return { styles: rest[0] }; });
var ENQUEUESETATTR = CREATEENQUEUER(MESSAGETYPES.SETATTR, true, function(rest) { return { name: rest[0], value: rest[1] }; });
var ENQUEUETOGGLECLASS = CREATEENQUEUER(MESSAGETYPES.TOGGLECLASS, true, function(rest) { return { classname: rest[0], force: rest[1] }; });
var ENQUEUECREATEELEMENT = CREATEENQUEUER(MESSAGETYPES.CREATEELEMENT, false, function(rest) { return { tag: rest[0], props: rest[1] }; });
var ENQUEUECREATECONTAINER = CREATEENQUEUER(MESSAGETYPES.CREATECONTAINER, false);
var ENQUEUECREATEFROMHTML = CREATEENQUEUER(MESSAGETYPES.CREATEFROMHTML, false, function(rest) { return { html: rest[0] }; });
var ENQUEUEGETHTML = CREATEENQUEUER(MESSAGETYPES.GETHTML, true);
var ENQUEUEGETVALUE = CREATEENQUEUER(MESSAGETYPES.GETVALUE, true);
var ENQUEUEGETSTYLE = CREATEENQUEUER(MESSAGETYPES.GETSTYLE, true);
var ENQUEUEGETPOSITION = CREATEENQUEUER(MESSAGETYPES.GETPOSITION, true);
var ENQUEUEGETLAYOUT = CREATEENQUEUER(MESSAGETYPES.GETLAYOUT, true);
var ENQUEUESETHTML = CREATEENQUEUER(MESSAGETYPES.SETHTML, true, function(rest) { return { value: rest[0] }; });
var ENQUEUESETPOSITION = CREATEENQUEUER(MESSAGETYPES.SETPOSITION, true, function(rest) { return { value: rest[0] }; });
var ENQUEUESETSTYLE = CREATEENQUEUER(MESSAGETYPES.SETSTYLE, true, function(rest) { return { value: rest[0] }; });
var ENQUEUESETVALUE = CREATEENQUEUER(MESSAGETYPES.SETVALUE, true, function(rest) { return { value: rest[0] }; });
var ENQUEUEPROPERTY = CREATEENQUEUER(MESSAGETYPES.PROPERTY, true, function(rest) { return { name: rest[0], arguments: rest[1] }; });
var ENQUEUESETLAYOUT = CREATEENQUEUER(MESSAGETYPES.SETLAYOUT, true, function(rest) { return { value: rest[0] }; });
var ENQUEUEGETVIEWPORT = CREATEENQUEUER(MESSAGETYPES.GETVIEWPORT, false);
var ENQUEUEGETSCREEN = CREATEENQUEUER(MESSAGETYPES.GETSCREEN, false);
var ENQUEUEMATCHMEDIA = CREATEENQUEUER(MESSAGETYPES.MATCHMEDIA, false, function(rest) { return { query: rest[0] }; });
var ENQUEUERENDERREGISTERTRIGGER = function(registration, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.REGISTER_TRIGGER, registration, tag, 'system', responseSpec);
};
var ENQUEUERENDERREGISTERTRIGGEREXPECTATION = function(registration, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.REGISTER_TRIGGER_EXPECTATION, registration, tag, 'system', responseSpec);
};
var ENQUEUERENDERREVALIDATETRIGGERS = function(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.REVALIDATE_TRIGGERS, {}, tag, 'system', responseSpec);
};
var ENQUEUERENDERPING = function(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.PING, {}, tag, 'system', responseSpec);
};
var ENQUEUERENDERGETBODYHTML = function(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.GET_BODY_HTML, {}, tag, 'system', responseSpec);
};
var ENQUEUERENDERRESTOREBODYHTML = function(html, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.RESTORE_BODY_HTML, { html: html }, tag, 'system', responseSpec);
};
var ENQUEUERENDERRECOVER = function(responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.RECOVER, {}, tag, 'system', responseSpec);
};
var ENQUEUERENDERCRYPTO = function(bytes, responseSpec) {
  var tag = GENERATETAG();
  SENDINSTRUCTION('RENDERACTOR', MESSAGETYPES.CRYPTO, { bytes: bytes }, tag, 'system', responseSpec);
};

var STARTRENDERACTOR = function(options) {
  if (options !== undefined) {
    var lvl = typeof options === 'number' ? options :
      (options && options.verbosity !== undefined ? options.verbosity : options.verbosityLevel);
    if (lvl !== undefined) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      if (env) env.verbosity = lvl;
    }
  }
  return {
    getstate: function() { return GETACTORSTATE('WORLDMAPACTOR'); },
    dispatch: function(message) { return DISPATCHTOACTOR('RENDERACTOR', RENDERBEHAVIOR, message); }
  };
};

var EXPECTELEMENT = function(id, timeout) {
  if (timeout === undefined) timeout = 30000;
  return new Promise(function(resolve, reject) {
    var existing = document.getElementById(id);
    if (existing) {
      var env = GETACTORSTATE('WORLDMAPACTOR');
      return resolve(CREATEDOMREF(existing, env.render.actorRegistry));
    }
    var observer = null;
    var timeoutid = setTimeout(function() { if (observer) observer.disconnect(); reject(new Error('[expectelement] element not found: ' + id)); }, timeout);
    observer = new MutationObserver(function() {
      var el = document.getElementById(id);
      if (el) {
        clearTimeout(timeoutid);
        observer.disconnect();
        var envNow = GETACTORSTATE('WORLDMAPACTOR');
        resolve(CREATEDOMREF(el, envNow.render.actorRegistry));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
};

var HANDLEFILEREADERREQUEST = function(payload) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) { resolve({ text: e.target.result }); };
    reader.onerror = function() { reject(new Error('[RENDERACTOR] FileReader error')); };
    reader.readAsText(payload.file);
  });
};
