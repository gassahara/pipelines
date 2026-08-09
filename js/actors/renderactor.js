import { createactor } from './actorkernel.js';
import { CREATEDOMREF } from '../fundamental/domref.js';
import { revalidateAll } from './trigerregistry.js';   // NEW IMPORT

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
    SETLAYOUT: 'setlayout'
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
  [MESSAGETYPES.SETLAYOUT]: { id: 'string', value: 'object', resolve: 'function?', reject: 'function?' }
});

export const validatemessage = (message) => {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'message must be a non-null object', type: 'null' };
  }
  var type = message.type;
  if (!type || typeof type !== 'string') {
    return { valid: false, error: 'message type must be a string, got: ' + typeof type, type: String(type) };
  }
  var iface = MESSAGEINTERFACES[type];
  if (!iface) {
    return { valid: false, error: 'unknown message type: ' + type, type: type };
  }
  var keys = Object.keys(iface);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var spec = iface[key];
    var optional = spec.charAt(spec.length - 1) === '?';
    var expectedtype = optional ? spec.slice(0, -1) : spec;
    if (message[key] === undefined || message[key] === null) {
      if (!optional) {
        return { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
      }
      continue;
    }
    if (expectedtype === 'any') continue;
    var actualtype = typeof message[key];
    if (actualtype !== expectedtype) {
      return { valid: false, error: 'type "' + type + '" field "' + key + '" expected ' + expectedtype + ' got ' + actualtype, type: type };
    }
  }
  return { valid: true, error: null, type: type };
};

var renderbehavior = function(state, message) {
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
    revalidateAll();   // NEW: innerHTML cleared
  } else if (message.type === MESSAGETYPES.HTML) {
    var target = document.getElementById(message.id);
    if (!target) {
      if (typeof message.resolve === 'function') {
        message.resolve();
      }
      return state;
    }
    if (message.append) {
      target.insertAdjacentHTML('beforeend', message.markup);
    } else {
      target.innerHTML = message.markup;
      revalidateAll();   // NEW: innerHTML replaced
    }
    if (typeof message.resolve === 'function') {
      message.resolve();
    }
  } else if (message.type === MESSAGETYPES.REMOVE) {
    var target = document.getElementById(message.id);
    if (target) target.remove();
    revalidateAll();   // NEW: element removed
  } else if (message.type === MESSAGETYPES.SETSTYLES) {
    var target = document.getElementById(message.id);
    if (target && message.styles && typeof message.styles === 'object') {
      var stykeys = Object.keys(message.styles);
      for (var si = 0; si < stykeys.length; si++) {
        target.style[stykeys[si]] = message.styles[stykeys[si]];
      }
    }
  } else if (message.type === MESSAGETYPES.SETATTR) {
    var target = document.getElementById(message.id);
    if (target && typeof message.name === 'string') {
      target.setAttribute(message.name, message.value);
    }
  } else if (message.type === MESSAGETYPES.TOGGLECLASS) {
    var target = document.getElementById(message.id);
    if (target && typeof message.classname === 'string') {
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
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
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
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (typeof message.resolve === 'function') {
      message.resolve({ tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML });
    }
  } else if (message.type === MESSAGETYPES.GETVALUE) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (typeof message.resolve === 'function') {
      message.resolve(el.value);
    }
  } else if (message.type === MESSAGETYPES.GETSTYLE) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (typeof message.resolve === 'function') {
      var computed = window.getComputedStyle(el);
      var styleobj = {};
      for (var si = 0; si < computed.length; si++) {
        styleobj[computed[si]] = computed.getPropertyValue(computed[si]);
      }
      message.resolve(styleobj);
    }
  } else if (message.type === MESSAGETYPES.GETPOSITION) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (typeof message.resolve === 'function') {
      var rect = el.getBoundingClientRect();
      message.resolve({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left });
    }
  } else if (message.type === MESSAGETYPES.GETLAYOUT) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
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
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    el.innerHTML = message.value;
    revalidateAll();   // NEW: innerHTML changed
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETPOSITION) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
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
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (message.value && typeof message.value === 'object') {
      var keys = Object.keys(message.value);
      for (var i = 0; i < keys.length; i++) {
        el.style[keys[i]] = message.value[keys[i]];
      }
    }
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETVALUE) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    el.value = message.value;
    if (typeof message.resolve === 'function') message.resolve();
  } else if (message.type === MESSAGETYPES.SETLAYOUT) {
    var el = document.getElementById(message.id);
    if (!el) {
      if (typeof message.reject === 'function') message.reject(new Error('element not found: ' + message.id));
      return state;
    }
    if (message.value && typeof message.value === 'object') {
      var keys = Object.keys(message.value);
      for (var li = 0; li < keys.length; li++) {
        el[keys[li]] = message.value[keys[li]];
      }
    }
    if (typeof message.resolve === 'function') message.resolve();
  }
  return state;
};

export const RENDERACTOR = createactor(renderbehavior, {});

export const enqueuerender = function(id, renderer, data, env) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuerender] id must be a non-empty string')); return; }
    if (typeof renderer !== 'function') { reject(new Error('[enqueuerender] renderer must be a function')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuerender] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.RENDER, id: id, renderer: renderer, data: data, env: env, resolve: resolve, reject: reject });
  });
};

export const enqueueclear = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueueclear] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueueclear] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.CLEAR, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuehtml = function(id, markup, append) {
  append = append || false;
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuehtml] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuehtml] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.HTML, id: id, markup: markup, append: append, resolve: resolve, reject: reject });
  });
};

export const enqueueremove = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueueremove] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueueremove] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.REMOVE, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuestyles = function(id, styles) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuestyles] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuestyles] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETSTYLES, id: id, styles: styles, resolve: resolve, reject: reject });
  });
};

export const enqueuesetattr = function(id, name, value) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuesetattr] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuesetattr] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETATTR, id: id, name: name, value: value, resolve: resolve, reject: reject });
  });
};

export const enqueuetoggleclass = function(id, classname, force) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuetoggleclass] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuetoggleclass] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.TOGGLECLASS, id: id, classname: classname, force: force, resolve: resolve, reject: reject });
  });
};

export const enqueuecreateelement = function(tag, props) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.CREATEELEMENT, tag: tag, props: props || null, resolve: resolve, reject: reject });
  });
};

export const enqueuecreatecontainer = function() {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.CREATECONTAINER, resolve: resolve, reject: reject });
  });
};

export const enqueuecreatefromhtml = function(html) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.CREATEFROMHTML, html: html, resolve: resolve, reject: reject });
  });
};

export const enqueuegethtml = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuegethtml] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuegethtml] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.GETHTML, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuegetvalue = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuegetvalue] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuegetvalue] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.GETVALUE, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuegetstyle = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuegetstyle] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuegetstyle] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.GETSTYLE, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuegetposition = function(id) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuegetposition] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuegetposition] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.GETPOSITION, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueuesethtml = function(id, value) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuesethtml] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuesethtml] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETHTML, id: id, value: value, resolve: resolve, reject: reject });
  });
};

export const enqueuesetposition = function(id, value) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuesetposition] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuesetposition] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETPOSITION, id: id, value: value, resolve: resolve, reject: reject });
  });
};

export const enqueuesetstyle = function(id, value) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuesetstyle] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuesetstyle] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETSTYLE, id: id, value: value, resolve: resolve, reject: reject });
  });
};

export const enqueuesetvalue = function(id, value) {
  return new Promise(function(resolve, reject) {
    if (!id || typeof id !== 'string') { reject(new Error('[enqueuesetvalue] id must be a non-empty string')); return; }
    var target = document.getElementById(id);
    if (!target) { reject(new Error('[enqueuesetvalue] element not found: ' + id)); return; }
    RENDERACTOR.send({ type: MESSAGETYPES.SETVALUE, id: id, value: value, resolve: resolve, reject: reject });
  });
};

export const DOMQUERYGETTERS = Object.freeze(['gethtml', 'getvalue', 'getstyle', 'getposition', 'getlayout']);
export const DOMQUERYSETTERS = Object.freeze(['sethtml', 'setposition', 'setstyle', 'setvalue', 'setlayout', 'toggleclass']);
export const DOMQUERYMESSAGES = Object.freeze(DOMQUERYGETTERS.concat(DOMQUERYSETTERS));

export const enqueueproperty = function(id, name, args) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.PROPERTY, id: id, name: name, arguments: args, resolve: resolve, reject: reject });
  });
};

export const enqueuegetlayout = function(id) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.GETLAYOUT, id: id, resolve: resolve, reject: reject });
  });
};

export const enqueusetlayout = function(id, value) {
  return new Promise(function(resolve, reject) {
    RENDERACTOR.send({ type: MESSAGETYPES.SETLAYOUT, id: id, value: value, resolve: resolve, reject: reject });
  });
};

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
