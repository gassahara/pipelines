// ============================================================
// UPDATED FILE: js/utils.js
// Change applied: ES5 syntax, functional paradigm, require/module.exports
// ============================================================

var deepmerge = function(target, source) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  var out = Object.keys(target).reduce(function(acc, k) {
    acc[k] = target[k];
    return acc;
  }, {});
  return Object.keys(source).reduce(function(acc, k) {
    acc[k] = (typeof source[k] === 'object' && !Array.isArray(source[k]) && k in target)
      ? deepmerge(target[k], source[k])
      : source[k];
    return acc;
  }, out);
};



function createApiConstants() {
  return Object.freeze({
    APIBASE: 'https://vflkhntzwfovnuyccxow.supabase.co/functions/v1'
  });
}

function escapehtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>'"]/g, function(tag) {
    var entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return entities[tag] || tag;
  });
}

function markdowntohtml(md) {
  if (!md) return '';
  var html = escapehtml(md);

  html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  var paragraphs = html.split(/\n\s*\n/);
  html = paragraphs.map(function(p) {
    if (p.indexOf('<h') === 0 || p.indexOf('<ul') === 0 || p.indexOf('<ol') === 0) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  return html;
}

function formataitext(text) {
  if (!text) return '';
  return text
    .split(/\n\n+/)
    .map(function(para) { return para.trim(); })
    .filter(function(para) { return para.length > 0; })
    .map(function(para) {
      var content = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return '<p>' + content.replace(/\n/g, '<br>') + '</p>';
    })
    .join('');
}

function resolvepath(path, source) {
  if (!path || typeof path !== 'string') return source;
  var keys = path.split('.');
  function walk(index, current) {
    if (index >= keys.length) return current;
    if (current == null || typeof current !== 'object') return null;
    return walk(index + 1, current[keys[index]]);
  }
  return walk(0, source);
}

function getprop(path, source, schemaname) {
  if (schemaname === undefined) schemaname = null;
  var value = resolvepath(path, source);
  if (schemaname) {
    var result = validate(value, schemaname);
    if (result.tag === 'failure') {
      throw new Error('[TypeSystem] Property "' + path + '" failed validation: ' + result.message);
    }
  }
  return value;
}

function getproperty(obj, prop) {
  if (obj && prop in obj && typeof obj[prop] !== 'function') {
    return JUST(obj[prop]);
  }
  return NOTHING();
}

function getfunction(obj, prop) {
  if (obj && typeof obj[prop] === 'function') {
    return JUST(obj[prop]);
  }
  return NOTHING();
}

function setproperty(obj, prop, value) {
  var out = Object.keys(obj).reduce(function(acc, key) {
    acc[key] = obj[key];
    return acc;
  }, {});
  out[prop] = value;
  return out;
}

// P11: Inject DOM dependency; optional doc parameter defaults to global document
function createnodefromtemplate(templateobj, doc) {
  if (!templateobj) return NOTHING();

  var documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new Error('[createnodefromtemplate] Document object not available; provide a valid DOM document.');
  }

  var html = templateobj.html;
  var tagname = templateobj.tagname || 'div';
  var attributes = templateobj.attributes || {};

  var container = documentRef.createElement(tagname);

  // DOM mutation via forEach is acceptable for side-effect-only DOM operations
  Object.keys(attributes).forEach(function(k) {
    var v = attributes[k];
    if (k === 'class') {
      container.className = v;
    } else {
      container.setAttribute(k, v);
    }
  });

  if (html) container.innerHTML = html;
  return JUST(container);
}
