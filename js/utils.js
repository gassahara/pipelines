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

function createapiconstants() {
  return Object.freeze({
    APIBASE: 'https://vflkhntzwfovnuyccxow.supabase.co/functions/v1'
  });
}

function escapehtml(str) {
  if (typeof str !== 'string') return '';
  return str.split('').map(function(ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === "'") return '&#39;';
    if (ch === '"') return '&quot;';
    return ch;
  }).join('');
}

function formatinlinetext(text) {
  if (!text) return '';
  function replacepairs(input, delim, opentag, closetag) {
    var parts = input.split(delim);
    if (parts.length < 3) return input;
    return parts.reduce(function(acc, part, idx) {
      if (idx === 0) return part;
      return acc + (idx % 2 === 1 ? opentag : closetag) + part;
    }, '');
  }
  var res = replacepairs(text, '***', '<strong><em>', '</em></strong>');
  res = replacepairs(res, '**', '<strong>', '</strong>');
  res = replacepairs(res, '*', '<em>', '</em>');
  return res;
}

function parseline(line) {
  var trimmed = line.trim();
  if (trimmed.indexOf('### ') === 0) {
    return '<h4>' + trimmed.slice(4) + '</h4>';
  }
  if (trimmed.indexOf('## ') === 0) {
    return '<h3>' + trimmed.slice(3) + '</h3>';
  }
  if (trimmed.indexOf('# ') === 0) {
    return '<h2>' + trimmed.slice(2) + '</h2>';
  }
  if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0 || trimmed.indexOf('+ ') === 0) {
    return '<li>' + trimmed.slice(2) + '</li>';
  }
  return trimmed;
}

function markdowntohtml(md) {
  if (!md) return '';
  var raw = escapehtml(md);
  var lines = raw.split('\n').map(function(l) { return l.trim(); });
  var processed = lines.map(function(l) {
    return formatinlinetext(parseline(l));
  });
  var blocks = processed.reduce(function(acc, line) {
    if (line === '') {
      acc.push([]);
    } else {
      if (acc.length === 0) acc.push([]);
      acc[acc.length - 1].push(line);
    }
    return acc;
  }, [[]]).filter(function(b) { return b.length > 0; });

  return blocks.map(function(group) {
    var first = group[0];
    if (first.indexOf('<h2') === 0 || first.indexOf('<h3') === 0 || first.indexOf('<h4') === 0) {
      return group.join('\n');
    }
    if (first.indexOf('<li>') === 0) {
      return '<ul>' + group.join('') + '</ul>';
    }
    return '<p>' + group.join('<br>') + '</p>';
  }).join('\n');
}

function formataitext(text) {
  if (!text) return '';
  var raw = escapehtml(text);
  var paras = raw.split('\n\n').map(function(p) { return p.trim(); }).filter(function(p) { return p.length > 0; });
  return paras.map(function(p) {
    var content = formatinlinetext(p).split('\n').join('<br>');
    return '<p>' + content + '</p>';
  }).join('');
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
    var validatefn = (typeof validate === 'function') ? validate : function() { return { tag: 'success' }; };
    var result = validatefn(value, schemaname);
    if (result.tag === 'failure') {
      throw new Error('[typesystem] Property "' + path + '" failed validation: ' + result.message);
    }
  }
  return value;
}

function getproperty(obj, prop) {
  if (obj && prop in obj && typeof obj[prop] !== 'function') {
    return (typeof just === 'function') ? just(obj[prop]) : { tag: 'JUST', value: obj[prop] };
  }
  return (typeof nothing === 'function') ? nothing() : { tag: 'NOTHING' };
}

function getfunction(obj, prop) {
  if (obj && typeof obj[prop] === 'function') {
    return (typeof just === 'function') ? just(obj[prop]) : { tag: 'JUST', value: obj[prop] };
  }
  return (typeof nothing === 'function') ? nothing() : { tag: 'NOTHING' };
}

function setproperty(obj, prop, value) {
  var out = Object.keys(obj).reduce(function(acc, key) {
    acc[key] = obj[key];
    return acc;
  }, {});
  out[prop] = value;
  return out;
}

function createnodefromtemplate(templateobj, doc) {
  if (!templateobj) return (typeof nothing === 'function') ? nothing() : { tag: 'NOTHING' };

  var documentref = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentref || typeof documentref.createElement !== 'function') {
    throw new Error('[createnodefromtemplate] Document object not available; provide a valid DOM document.');
  }

  var html = templateobj.html;
  var tagname = templateobj.tagname || 'div';
  var attributes = templateobj.attributes || {};

  var container = documentref.createElement(tagname);

  Object.keys(attributes).forEach(function(k) {
    var v = attributes[k];
    if (k === 'class') {
      container.className = v;
    } else {
      container.setAttribute(k, v);
    }
  });

  if (html) container.innerHTML = html;
  return (typeof just === 'function') ? just(container) : { tag: 'JUST', value: container };
}
