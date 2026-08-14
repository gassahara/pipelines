import { createactor, createMessageValidator } from './actorkernel.js';
import { CREATEDOMREF } from '../fundamental/domref.js';
import { revalidateAll } from './trigerregistry.js';
import { setRenderActor } from './actorregistry.js';

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
  MATCHMEDIA: 'matchmedia'
});

var MESSAGEINTERFACES = Object.freeze({
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
  [MESSAGETYPES.MATCHMEDIA]:  { query: 'string', resolve: 'function', reject: 'function?' }
});

// Shared validator from actorkernel
const validatemessage = createMessageValidator(MESSAGEINTERFACES);

// Internal helper to retrieve element and reject promise if missing
function getElementOrFail(id, reject) {
    if (!id || typeof id !== 'string') {
        reject(new Error('[RENDERACTOR] id must be a non-empty string'));
        return null;
    }
    var el = document.getElementById(id);
    if (!el) {
        reject(new Error('[RENDERACTOR] element not found: ' + id));
        return null;
    }
    return el;
}

// Macro to generate enqueue functions (FC2)
function createEnqueuer(type, idRequired, extraPayloadFn) {
    return function(...args) {
        var id = idRequired ? args[0] : undefined;
        var rest = idRequired ? Array.prototype.slice.call(args, 1) : args;
        return new Promise(function(resolve, reject) {
            if (idRequired) {
                if (!id || typeof id !== 'string') {
                    reject(new Error('[' + type + '] id must be a non-empty string'));
                    return;
                }
                if (!document.getElementById(id)) {
                    reject(new Error('[' + type + '] element not found: ' + id));
                    return;
                }
            }
            var extra = extraPayloadFn ? extraPayloadFn(rest) : {};
            var message = { type: type, id: id, resolve: resolve, reject: reject };
            for (var k in extra) { message[k] = extra[k]; }
            RENDERACTOR.send(message);
        });
    };
}

var renderbehavior = function(state, message) {
  // If RENDER message has missing/null id, assign a unique internal id.
  // This preserves strict validation while allowing ref-based renders.
  if (message.type === MESSAGETYPES.RENDER && (message.id === null || message.id === undefined)) {
      renderbehavior._refcounter = (renderbehavior._refcounter || 0) + 1;
      message.id = '__ref_render_' + Date.now() + '_' + renderbehavior._refcounter;
  }

  var check = validatemessage(message);
  if (!check.valid) {
    console.error('[RENDERACTOR:UNKNOWNTYPE] type=' + check.type + ' error=' + check.error);
    return state;
  }
  if (message.type === MESSAGETYPES.RENDER) {
    var target = message.id ? document.getElementById(message.id) : null;
    if (typeof message.renderer === 'function') {
      try {
        message.renderer(target, message.data, message.env || {});
      } catch (err) {
        console.error('[RENDERACTOR] Renderer error:', err);
        throw err;
      }
    }
  } else if (message.type === MESSAGETYPES.CLEAR) {
    var target = document.getElementById(message.id);
    if (target) target.innerHTML = '';
    revalidateAll();
  } else if (message.type === MESSAGETYPES.HTML) {
    var target = getElementOrFail(message.id, message.reject);
    if (!target) return state;
    if (message.append) {
      target.insertAdjacentHTML('beforeend', message.markup);
    } else {
      target.innerHTML = message.markup;
      revalidateAll();
    }
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.REMOVE) {
    var target = document.getElementById(message.id);
    if (target) target.remove();
    revalidateAll();
  } else if (message.type === MESSAGETYPES.SETSTYLES) {
    var target = getElementOrFail(message.id, message.reject);
    if (!target) return state;
    if (message.styles && typeof message.styles === 'object') {
      var stykeys = Object.keys(message.styles);
      for (var si = 0; si < stykeys.length; si++) {
        target.style[stykeys[si]] = message.styles[stykeys[si]];
      }
    }
  } else if (message.type === MESSAGETYPES.SETATTR) {
    var target = getElementOrFail(message.id, message.reject);
    if (!target) return state;
    if (typeof message.name === 'string') {
      target.setAttribute(message.name, message.value);
    }
  } else if (message.type === MESSAGETYPES.TOGGLECLASS) {
    var target = getElementOrFail(message.id, message.reject);
    if (!target) return state;
    if (typeof message.classname === 'string') {
      target.classList.toggle(message.classname, message.force);
    }
  } else if (message.type === MESSAGETYPES.CRYPTO) {
    var win = typeof window !== 'undefined' ? window : globalThis;
    var array = new Uint8Array(message.bytes);
    win.crypto.getRandomValues(array);
    if (typeof message.resolve === 'function') {
      message.resolve(Array.from(array));
    }
  } else if (message.type === MESSAGETYPES.GEOLOCATION) {
    var win = typeof window !== 'undefined' ? window : globalThis;
    var geo = win.navigator && win.navigator.geolocation;
    if (!geo) {
      if (typeof message.reject === 'function') message.reject(new Error('geolocation API unavailable'));
      return state;
    }
    geo.getCurrentPosition(
      function(pos) {
        var coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (typeof message.resolve === 'function') message.resolve(coords);
      },
      function(err) {
        if (typeof message.reject === 'function') message.reject(new Error('geolocation failed: ' + err.message));
      },
      { enablehighaccuracy: message.enablehighaccuracy || false, timeout: message.timeout || 5000 }
    );
    return state;
  } else if (message.type === MESSAGETYPES.PERSISTENCE) {
    var storagewin = typeof window !== 'undefined' ? window : globalThis;
    var storage = storagewin.localStorage;
    if (!storage) {
      if (typeof message.reject === 'function') message.reject(new Error('localStorage unavailable'));
      return state;
    }
    try {
      var presult;
      if (message.action === 'getItem') {
        presult = { value: storage.getItem(message.key) };
      } else if (message.action === 'setItem') {
        storage.setItem(message.key, message.value);
        presult = { success: true };
      } else if (message.action === 'removeItem') {
        storage.removeItem(message.key);
        presult = { success: true };
      } else if (message.action === 'clear') {
        storage.clear();
        presult = { success: true };
      } else {
        if (typeof message.reject === 'function') message.reject(new Error('unknown persistence action: ' + message.action));
        return state;
      }
      if (typeof message.resolve === 'function') message.resolve(presult);
    } catch (err) {
      if (typeof message.reject === 'function') message.reject(err);
    }
  } else if (message.type === MESSAGETYPES.CREATEELEMENT) {
    try {
      var el = document.createElement(message.tag);
      if (message.props && typeof message.props === 'object') {
        var pkeys = Object.keys(message.props);
        for (var pi = 0; pi < pkeys.length; pi++) {
          el[pkeys[pi]] = message.props[pkeys[pi]];
        }
      }
      if (typeof message.resolve === 'function') message.resolve(CREATEDOMREF(el));
    } catch (err) {
      if (typeof message.reject === 'function') message.reject(err);
    }
  } else if (message.type === MESSAGETYPES.CREATECONTAINER) {
    try {
      var container = document.createElement('div');
      if (typeof message.resolve === 'function') message.resolve(CREATEDOMREF(container));
    } catch (err) {
      if (typeof message.reject === 'function') message.reject(err);
    }
  } else if (message.type === MESSAGETYPES.CREATEFROMHTML) {
    try {
      var wrapper = document.createElement('div');
      wrapper.innerHTML = message.html;
      var child = wrapper.firstElementChild;
      if (typeof message.resolve === 'function') message.resolve(CREATEDOMREF(child || wrapper));
    } catch (err) {
      if (typeof message.reject === 'function') message.reject(err);
    }
  } else if (message.type === MESSAGETYPES.PROPERTY) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    var fn = el[message.name];
    if (typeof fn !== 'function') {
      if (typeof message.reject === 'function') message.reject(new Error('property "' + message.name + '" is not a function on element ' + message.id));
      return state;
    }
    try {
      var result = fn.apply(el, message.arguments || []);
      if (typeof message.resolve === 'function') message.resolve(result);
    } catch (e) {
      if (typeof message.reject === 'function') message.reject(e);
    }
  } else if (message.type === MESSAGETYPES.GETHTML) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (typeof message.resolve === 'function') {
      message.resolve({ tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML });
    }
  } else if (message.type === MESSAGETYPES.GETVALUE) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (typeof message.resolve === 'function') {
      message.resolve(el.value);
    }
  } else if (message.type === MESSAGETYPES.GETSTYLE) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (typeof message.resolve === 'function') {
      var computed = window.getComputedStyle(el);
      var styleobj = {};
      for (var si = 0; si < computed.length; si++) {
        styleobj[computed[si]] = computed.getPropertyValue(computed[si]);
      }
      message.resolve(styleobj);
    }
  } else if (message.type === MESSAGETYPES.GETPOSITION) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (typeof message.resolve === 'function') {
      var rect = el.getBoundingClientRect();
      message.resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
    }
  } else if (message.type === MESSAGETYPES.GETLAYOUT) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (typeof message.resolve === 'function') {
      message.resolve({
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        offsetLeft: el.offsetLeft,
        offsetTop: el.offsetTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight
      });
    }
  } else if (message.type === MESSAGETYPES.SETHTML) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    el.innerHTML = message.value;
    revalidateAll();
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETPOSITION) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (message.value && typeof message.value === 'object') {
      var oldstyle = el.getAttribute('style') || '';
      var pairs = oldstyle.split(';');
      var stylemap = {};
      for (var pi = 0; pi < pairs.length; pi++) {
        var ci = pairs[pi].indexOf(':');
        if (ci > 0) {
          stylemap[pairs[pi].slice(0, ci).trim()] = pairs[pi].slice(ci + 1).trim();
        } else if (pairs[pi].trim()) {
          stylemap[pairs[pi].trim()] = '';
        }
      }
      var keys = Object.keys(message.value);
      for (var ki = 0; ki < keys.length; ki++) {
        stylemap[keys[ki]] = message.value[keys[ki]];
      }
      var mergedkeys = Object.keys(stylemap);
      var merged = '';
      for (var mi = 0; mi < mergedkeys.length; mi++) {
        if (mi > 0) merged += ';';
        merged += mergedkeys[mi] + ':' + stylemap[mergedkeys[mi]];
      }
      el.setAttribute('style', merged);
    }
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETSTYLE) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (message.value && typeof message.value === 'object') {
      var keys = Object.keys(message.value);
      for (var i = 0; i < keys.length; i++) {
        el.style[keys[i]] = message.value[keys[i]];
      }
    }
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETVALUE) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    el.value = message.value;
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETLAYOUT) {
    var el = getElementOrFail(message.id, message.reject);
    if (!el) return state;
    if (message.value && typeof message.value === 'object') {
      var keys = Object.keys(message.value);
      for (var li = 0; li < keys.length; li++) {
        el[keys[li]] = message.value[keys[li]];
      }
    }
    if (typeof message.resolve === 'function') message.resolve();
  }
  // ==================== NEW HANDLERS ====================
  else if (message.type === MESSAGETYPES.GETVIEWPORT) {
    var vpWidth  = document.documentElement.clientWidth;
    var vpHeight = document.documentElement.clientHeight;
    if (typeof message.resolve === 'function') {
      message.resolve({ viewportWidth: vpWidth, viewportHeight: vpHeight });
    }
  }
  else if (message.type === MESSAGETYPES.GETSCREEN) {
    var scr = window.screen;
    if (typeof message.resolve === 'function') {
      message.resolve({
        screenWidth:  scr.width,
        screenHeight: scr.height,
        availWidth:   scr.availWidth,
        availHeight:  scr.availHeight
      });
    }
  }
  else if (message.type === MESSAGETYPES.MATCHMEDIA) {
    var mq = window.matchMedia(message.query);
    if (typeof message.resolve === 'function') {
      message.resolve({ matches: mq.matches });
    }
  }
  return state;
};

export const RENDERACTOR = createactor(renderbehavior, {});
setRenderActor(RENDERACTOR);

// Enqueue functions generated via macro (FC2)
export const enqueuerender = createEnqueuer(MESSAGETYPES.RENDER, true, function(rest) {
    return { renderer: rest[0], data: rest[1], env: rest[2] };
});
export const enqueueclear = createEnqueuer(MESSAGETYPES.CLEAR, true);
export const enqueuehtml = createEnqueuer(MESSAGETYPES.HTML, true, function(rest) {
    return { markup: rest[0], append: rest[1] };
});
export const enqueueremove = createEnqueuer(MESSAGETYPES.REMOVE, true);
export const enqueuestyles = createEnqueuer(MESSAGETYPES.SETSTYLES, true, function(rest) {
    return { styles: rest[0] };
});
export const enqueuesetattr = createEnqueuer(MESSAGETYPES.SETATTR, true, function(rest) {
    return { name: rest[0], value: rest[1] };
});
export const enqueuetoggleclass = createEnqueuer(MESSAGETYPES.TOGGLECLASS, true, function(rest) {
    return { classname: rest[0], force: rest[1] };
});
export const enqueuecreateelement = createEnqueuer(MESSAGETYPES.CREATEELEMENT, false, function(rest) {
    return { tag: rest[0], props: rest[1] };
});
export const enqueuecreatecontainer = createEnqueuer(MESSAGETYPES.CREATECONTAINER, false);
export const enqueuecreatefromhtml = createEnqueuer(MESSAGETYPES.CREATEFROMHTML, false, function(rest) {
    return { html: rest[0] };
});
export const enqueuegethtml = createEnqueuer(MESSAGETYPES.GETHTML, true);
export const enqueuegetvalue = createEnqueuer(MESSAGETYPES.GETVALUE, true);
export const enqueuegetstyle = createEnqueuer(MESSAGETYPES.GETSTYLE, true);
export const enqueuegetposition = createEnqueuer(MESSAGETYPES.GETPOSITION, true);
export const enqueuesethtml = createEnqueuer(MESSAGETYPES.SETHTML, true, function(rest) {
    return { value: rest[0] };
});
export const enqueuesetposition = createEnqueuer(MESSAGETYPES.SETPOSITION, true, function(rest) {
    return { value: rest[0] };
});
export const enqueuesetstyle = createEnqueuer(MESSAGETYPES.SETSTYLE, true, function(rest) {
    return { value: rest[0] };
});
export const enqueuesetvalue = createEnqueuer(MESSAGETYPES.SETVALUE, true, function(rest) {
    return { value: rest[0] };
});
export const DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
export const DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
export const DOMQUERYMESSAGES = Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS));

export const enqueueproperty = createEnqueuer(MESSAGETYPES.PROPERTY, true, function(rest) {
    return { name: rest[0], arguments: rest[1] };
});
export const enqueuegetlayout = createEnqueuer(MESSAGETYPES.GETLAYOUT, true);
export const enqueusetlayout = createEnqueuer(MESSAGETYPES.SETLAYOUT, true, function(rest) {
    return { value: rest[0] };
});

export const expectelement = function(id, timeout) {
  timeout = timeout || 30000;
  return new Promise(function(resolve, reject) {
    var existing = document.getElementById(id);
    if (existing) {
      resolve(CREATEDOMREF(existing));
      return;
    }
    var observer = null;
    var timeoutid = null;
    var cleanup = function() {
      if (observer) observer.disconnect();
      if (timeoutid) clearTimeout(timeoutid);
    };
    var onfound = function(el) {
      cleanup();
      resolve(CREATEDOMREF(el));
    };
    var ontimeout = function() {
      cleanup();
      reject(new Error('[expectelement] element not found: ' + id));
    };
    timeoutid = setTimeout(ontimeout, timeout);
    observer = new MutationObserver(function() {
      var el = document.getElementById(id);
      if (el) onfound(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
};

export const handlefilereaderrequest = function(payload) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(event) {
      resolve({ text: event.target.result });
    };
    reader.onerror = function() {
      reject(new Error('[renderactor] FileReader error'));
    };
    reader.readAsText(payload.file);
  });
};

export const enqueuegetviewport = createEnqueuer(MESSAGETYPES.GETVIEWPORT, false);
export const enqueuegetscreen = createEnqueuer(MESSAGETYPES.GETSCREEN, false);
export const enqueuematchmedia = createEnqueuer(MESSAGETYPES.MATCHMEDIA, false, function(rest) {
    return { query: rest[0] };
});
