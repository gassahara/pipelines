function hasobj(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// ---- OP-089: per-kind directive parsers (extracted from the switch in parsedirectives) ----
function dpedge(d, params) {
  d.target = params[0];
  if (params[1]) d.offset = parseFloat(params[1]);
  if (params[2]) d.unit = params[2];
}

function dpbetween(d, params) {
  if (!params[0] || params[0].indexOf('and') === -1) {
    d.invalid = true;
    return;
  }
  var targets = params[0].split('and').map(function(s) { return s.trim(); });
  d.target1 = targets[0];
  d.target2 = targets[1];
  if (params[1]) d.offset = parseFloat(params[1]);
  if (params[2]) d.unit = params[2];
}

function dpvaluewithcontainer(d, params) {
  d.value = params[0];
  if (params[1]) d.container = params[1];
}

function dpvalue(d, params) {
  d.value = params[0];
}

function dpanchor(d, params) {
  d.targetid = params[0];
  d.mycorner = params[1] || 'top-left';
  d.targetcorner = params[2] || 'top-left';
}

function dpzstack(d, params) {
  d.mode = params[0];
  if (params.length > 1) d.targetid = params[1];
}

function dpmode(d, params) {
  d.mode = params[0];
}

function dprespectmargins(d, params) {
  d.value = params[0] === 'true';
}

function dpoverflowmargins(d, params) {
  d.mode = params[0] || 'include';
}

function dpscreencorner(d, params) {
  d.corner = params[0];
}

var directiveparsers = {
  'left-of': dpedge,
  'right-of': dpedge,
  'above': dpedge,
  'below': dpedge,
  'between': dpbetween,
  'align': dpvaluewithcontainer,
  'justify': dpvaluewithcontainer,
  'immerse': dpvaluewithcontainer,
  'position': dpvalue,
  'anchor': dpanchor,
  'z-stack': dpzstack,
  'overlap': dpmode,
  'overflow': dpmode,
  'respect-margins': dprespectmargins,
  'overflow-margins': dpoverflowmargins,
  'screen-corner': dpscreencorner
};

// ---- OP-090: per-kind CSS emitters (extracted from the switch in generatecssfromdirectives) ----
function deleftof(acc, d, offsetstr) { acc.order = -1; acc.marginRight = offsetstr; return acc; }
function derightof(acc, d, offsetstr) { acc.order = 1; acc.marginLeft = offsetstr; return acc; }
function deabove(acc, d, offsetstr) { acc.marginBottom = offsetstr; return acc; }
function debelow(acc, d, offsetstr) { acc.marginTop = offsetstr; return acc; }

function dealign(acc, d) {
  acc.display = 'flex';
  acc.justifyContent = d.value;
  return acc;
}

function dejustify(acc, d) {
  acc.textAlign = d.value.replace('text-', '');
  return acc;
}

function deimmerse(acc, d) {
  acc.display = 'flex';
  acc.alignItems = 'center';
  acc.justifyContent = 'center';
  return acc;
}

function deposition(acc, d, offsetstr, positionmap) {
  if (positionmap[d.value]) {
    Object.keys(positionmap[d.value]).forEach(function(k) {
      if (hasobj(positionmap[d.value], k)) acc[k] = positionmap[d.value][k];
    });
  }
  return acc;
}

function deanchor(acc, d) {
  acc.position = 'absolute';
  acc.anchor = { targetid: d.targetid, mycorner: d.mycorner, targetcorner: d.targetcorner };
  return acc;
}

function dezstack(acc, d) {
  acc.zIndex = 'auto';
  if (d.mode === 'topmost') acc.zstacktopmost = true;
  else if (d.mode === 'bottommost') acc.zstackbottommost = true;
  else if (d.mode === 'above' && d.targetid) acc.zstackabove = d.targetid;
  else if (d.mode === 'below' && d.targetid) acc.zstackbelow = d.targetid;
  return acc;
}

function deoverlap(acc, d) {
  if (d.mode === 'prevent') {
    acc.position = 'static';
    acc.clear = 'both';
  }
  return acc;
}

function deoverflow(acc, d) {
  acc.overflow = d.mode;
  if (d.mode === 'auto' || d.mode === 'scroll') {
    acc.overflowWrap = 'break-word';
    acc.wordWrap = 'break-word';
  }
  return acc;
}

function derespectmargins(acc, d) {
  if (d.value && !acc.margin) acc.margin = '0.5rem';
  return acc;
}

function deoverflowmargins(acc, d) {
  if (d.mode === 'include') acc.overflow = 'visible';
  return acc;
}

function descreencorner(acc, d, offsetstr, positionmap, cornermap) {
  if (cornermap[d.corner]) {
    Object.keys(cornermap[d.corner]).forEach(function(k2) {
      if (hasobj(cornermap[d.corner], k2)) acc[k2] = cornermap[d.corner][k2];
    });
  }
  return acc;
}

var directiveemitters = {
  'left-of': deleftof,
  'right-of': derightof,
  'above': deabove,
  'below': debelow,
  'align': dealign,
  'justify': dejustify,
  'immerse': deimmerse,
  'position': deposition,
  'anchor': deanchor,
  'z-stack': dezstack,
  'overlap': deoverlap,
  'overflow': deoverflow,
  'respect-margins': derespectmargins,
  'overflow-margins': deoverflowmargins,
  'screen-corner': descreencorner
};

// ---- OP-091: per-goal handlers (extracted from optimizelayouthtml's dispatch) ----
function ghminverticalgap(doc, goal, stylizercore, layoutcorrection) {
  var mingap = goal.options && goal.options.mingap != null ? goal.options.mingap : 12;
  var violations = layoutcorrection.checkspacingdoc(doc, mingap, stylizercore);
  if (!violations.length) return null;
  return function() { return layoutcorrection.correctspacingdoc(doc, mingap, stylizercore, layoutcorrection); };
}

function ghpreventoverlap(doc, goal, stylizercore, layoutcorrection) {
  var violations = layoutcorrection.checkoverlapdoc(doc);
  if (!violations.length) return null;
  return function() { return layoutcorrection.correctoverlapdoc(doc, layoutcorrection); };
}

function ghscrollability(doc, goal, stylizercore, layoutcorrection) {
  var violations = layoutcorrection.checkscrollabilitydoc(doc);
  if (!violations.length) return null;
  return function() { return layoutcorrection.correctscrollabilitydoc(doc, layoutcorrection); };
}

function ghcontrolledoverlay(doc, goal, stylizercore, layoutcorrection) {
  var violations = layoutcorrection.checkcontrolledoverlaydoc(doc);
  if (!violations.length) return null;
  return function() { return layoutcorrection.correctcontrolledoverlaydoc(doc, layoutcorrection); };
}

var goalhandlers = {
  'minverticalgap': ghminverticalgap,
  'preventoverlap': ghpreventoverlap,
  'scrollability': ghscrollability,
  'controlledoverlay': ghcontrolledoverlay
};

function createlayoutdirectives(stylizer) {
  var stylizercore = stylizer.stylizercore;
  var stylizerrewrite = stylizer.stylizerrewrite;

  var layoutdirectivecore = {
    has: hasobj,  // ---- OP-088 ----

    createlayoutconstants: function() {
      return Object.freeze({
        positionmap: Object.freeze({
          'top': { position: 'relative', top: '0' },
          'bottom': { position: 'relative', bottom: '0' },
          'left': { position: 'relative', left: '0' },
          'right': { position: 'relative', right: '0' },
          'middle': { position: 'relative', top: '50%', transform: 'translateY(-50%)' },
          'center': { maxWidth: '960px', margin: '0 auto' },
          'top-left': { position: 'relative', top: '0', left: '0' },
          'top-right': { position: 'relative', top: '0', right: '0' },
          'bottom-left': { position: 'relative', bottom: '0', left: '0' },
          'bottom-right': { position: 'relative', bottom: '0', right: '0' },
          'screen-top-left': { position: 'fixed', top: '0', left: '0' },
          'screen-top-right': { position: 'fixed', top: '0', right: '0' },
          'screen-bottom-left': { position: 'fixed', bottom: '0', left: '0' },
          'screen-bottom-right': { position: 'fixed', bottom: '0', right: '0' },
          'screen-center': { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }),
        cornermap: Object.freeze({
          'top-left': { position: 'fixed', top: '0', left: '0' },
          'top-right': { position: 'fixed', top: '0', right: '0' },
          'bottom-left': { position: 'fixed', bottom: '0', left: '0' },
          'bottom-right': { position: 'fixed', bottom: '0', right: '0' }
        })
      });
    },

    parsedirectives: function(str) {
      if (!str) return [];

      var parts = str.split(';').map(function(s) { return s.trim(); }).filter(Boolean);

      function parsepart(part, breakpoint) {
        var colonidx = part.indexOf(':');
        var type = colonidx > -1 ? part.substring(0, colonidx).trim() : part.trim();
        var rest = colonidx > -1 ? part.substring(colonidx + 1).trim() : '';
        var params = rest ? rest.split(',').map(function(p) { return p.trim(); }) : [];
        var directive = { type: type };
        if (breakpoint) directive.breakpoint = breakpoint;

        // ---- OP-089: table-driven dispatch ----
        var parser = directiveparsers[type];
        if (parser) {
          parser(directive, params);
        } else {
          directive.raw = { property: type, value: rest };
        }

        return directive;
      }

      function parseparts(index, acc) {
        if (index >= parts.length) return acc.filter(function(d) { return !d.invalid; });
        var part = parts[index];
        var breakpoint = null;

        if (part.indexOf('@') === 0) {
          var colonidx = part.indexOf(':');
          if (colonidx > 1) {
            breakpoint = part.substring(1, colonidx);
            part = part.substring(colonidx + 1).trim();
          }
        }

        return parseparts(index + 1, acc.concat([parsepart(part, breakpoint)]));
      }

      return parseparts(0, []);
    },

    generatecssfromdirectives: function(elementid, directives, breakpointmap, layoutdirectivecore) {
      if (breakpointmap === undefined) breakpointmap = {};
      var constants = layoutdirectivecore.createlayoutconstants();
      var positionmap = constants.positionmap;
      var cornermap = constants.cornermap;

      var inlinestyles = directives
        .filter(function(d) { return !d.breakpoint; })
        .reduce(function(acc, d) {
          var offsetstr = (d.offset || 0) + (d.unit || 'px');

          // ---- OP-090: table-driven dispatch ----
          var emitter = directiveemitters[d.type];
          if (emitter) {
            return emitter(acc, d, offsetstr, positionmap, cornermap);
          }
          if (d.raw) {
            acc[stylizercore.kebabcamel(d.raw.property)] = d.raw.value;
          }
          return acc;
        }, {});

      return { inline: inlinestyles };
    },

    applydirectivetoselector: function(html, selector, directivestring, layoutdirectivecore) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var directives = layoutdirectivecore.parsedirectives(directivestring);
      var elements = Array.prototype.slice.call(doc.querySelectorAll(selector));

      elements.forEach(function(el, idx) {
        var id = el.id || '_gen_id_' + idx;
        var result = layoutdirectivecore.generatecssfromdirectives(id, directives, undefined, layoutdirectivecore);

        Object.keys(result.inline).forEach(function(prop) {
          if (hasobj(result.inline, prop)) {  // ---- OP-088 ----
            el.style[prop] = result.inline[prop];
          }
        });
      });

      return doc.body.innerHTML;
    }
  };

  function extractelementid(descriptor) {
    var hash = descriptor.indexOf('#');
    if (hash === -1) return null;
    return descriptor.slice(hash + 1);
  }

  var layoutcorrection = {
    has: hasobj,  // ---- OP-088 ----

    getcandidateelements: function(doc, stylizercore) {
      return stylizercore.applystep([doc.body], { axis: 'descendant' }, null, stylizercore).filter(function(el) {
        var tag = el.tagName.toLowerCase();
        if (tag === 'table' || tag === 'pre' || tag === 'img') return true;
        if (tag === 'div' && el.style && (el.style.width || el.style.maxWidth)) return true;
        return false;
      });
    },

    checkoverflowdoc: function(doc, viewportwidth, containerwidths, stylizercore, layoutcorrection) {
      function isinsidescrollwrapper(el) {
        function climb(parent) {
          if (!parent) return false;
          var s = parent.style || {};
          if (parent.tagName.toLowerCase() === 'div' &&
              (s.width || s.maxWidth) &&
              s.overflow === 'scroll') return true;
          return climb(parent.parentElement);
        }
        return climb(el.parentElement);
      }

      var propertymap = stylizercore.buildlayoutpropertymap(doc.body, viewportwidth, undefined, stylizercore);

      return layoutcorrection.getcandidateelements(doc, stylizercore)
        .filter(function(el) { return !isinsidescrollwrapper(el); })
        .filter(function(el) {
          var props = stylizercore.getpropsfrommap(propertymap, el, stylizercore);
          if (!props) return false;

          try {
            var size = stylizercore.computeintrinsicsize(el, propertymap, props, stylizercore);
            return size.width > props.availableWidth;
          } catch (err) {
            stylizercore.warn('[checkoverflowdoc] Failed to compute intrinsic size:', el.tagName, err);
            return false;
          }
        });
    },

    correctoverflowdoc: function(doc, overflowelements) {
      function isinsidescrollwrapper(el) {
        function climb(parent) {
          if (!parent) return false;
          var s = parent.style || {};
          if (parent.tagName.toLowerCase() === 'div' &&
              (s.width || s.maxWidth) &&
              s.overflow === 'scroll') return true;
          return climb(parent.parentElement);
        }
        return climb(el.parentElement);
      }

      return overflowelements.filter(function(el) { return !isinsidescrollwrapper(el); }).map(function(el) {
        var wrapper = doc.createElement('div');
        wrapper.style.width = '80%';
        wrapper.style.overflow = 'scroll';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);

        return {
          selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
          styles: { wrapped: 'true' }
        };
      });
    },

    checkspacingdoc: function(doc, mingap, stylizercore) {
      if (mingap === undefined) mingap = 12;

      var blocktags = [
        'div', 'section', 'article', 'header', 'footer', 'nav',
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'
      ];

      function contains(arr, item) { return arr.indexOf(item) !== -1; }

      function iseligiblecontainer(el) {
        var style = el.style || {};
        var display = style.display || '';
        return display !== 'flex' && display !== 'grid';
      }

      function iseligiblechild(el) {
        if (!el || el.nodeType !== 1) return false;
        var style = el.style || {};
        if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return false;
        if (contains(blocktags, el.tagName.toLowerCase())) return true;
        var display = style.display || '';
        return display === 'block' || display === 'flex' || display === 'grid';
      }

      function filtereligiblechildren(children, index, acc) {
        if (index >= children.length) return acc;
        var child = children[index];
        if (iseligiblechild(child)) acc.push(child);
        return filtereligiblechildren(children, index + 1, acc);
      }

      function comparechildren(children, index, violations) {
        if (index >= children.length - 1) return violations;
        var a = children[index];
        var b = children[index + 1];
        var gap = (parseFloat(a.style.marginBottom) || 0) + (parseFloat(b.style.marginTop) || 0);
        if (gap < mingap) {
          violations.push({ elementa: a, elementb: b, gap: gap });
        }
        return comparechildren(children, index + 1, violations);
      }

      function walkparentchildren(parent, childindex, violations) {
        var rawchildren = Array.prototype.slice.call(parent.children);
        if (childindex >= rawchildren.length) return violations;
        var child = rawchildren[childindex];
        walk(child, violations);
        return walkparentchildren(parent, childindex + 1, violations);
      }

      function walk(node, violations) {
        if (!node || node.nodeType !== 1) return violations;
        if (!iseligiblecontainer(node)) return violations;
        var rawchildren = Array.prototype.slice.call(node.children);
        var eligible = filtereligiblechildren(rawchildren, 0, []);
        violations = comparechildren(eligible, 0, violations);
        return walkparentchildren(node, 0, violations);
      }

      return walk(doc.body, []);
    },

    correctspacingdoc: function(doc, mingap, stylizercore, layoutcorrection) {
      if (mingap === undefined) mingap = 12;
      var violations = layoutcorrection.checkspacingdoc(doc, mingap, stylizercore);

      function buildrules(index, acc) {
        if (index >= violations.length) return acc;
        var violation = violations[index];
        var el = violation.elementa;
        if (!el) return buildrules(index + 1, acc);

        el.style.marginBottom = mingap + 'px';
        acc.push({
          selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
          styles: { marginBottom: mingap + 'px' }
        });
        return buildrules(index + 1, acc);
      }

      return buildrules(0, []);
    },

    checkoverlapdoc: function(doc) {
      var positioned = Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
        return el.style && (el.style.position === 'absolute' || el.style.position === 'fixed');
      });

      var violations = positioned.reduce(function(acc, a, i) {
        return positioned.slice(i + 1).reduce(function(inneracc, b) {
          var atop = parseFloat(a.style.top) || 0, aleft = parseFloat(a.style.left) || 0,
              aw = parseFloat(a.style.width) || 0, ah = parseFloat(a.style.height) || 0;
          var btop = parseFloat(b.style.top) || 0, bleft = parseFloat(b.style.left) || 0,
              bw = parseFloat(b.style.width) || 0, bh = parseFloat(b.style.height) || 0;

          if (aw && ah && bw && bh &&
              aleft < bleft + bw && aleft + aw > bleft &&
              atop < btop + bh && atop + ah > btop) {
            return inneracc.concat([{
              elementa: a.tagName + (a.id ? '#' + a.id : ''),
              elementb: b.tagName + (b.id ? '#' + b.id : '')
            }]);
          }
          return inneracc;
        }, acc);
      }, []);

      return violations;
    },

    correctoverlapdoc: function(doc, layoutcorrection) {
      return layoutcorrection.checkoverlapdoc(doc).map(function(violation) {
        var id = extractelementid(violation.elementb);
        var el = id !== null ? doc.getElementById(id) : null;
        if (!el) el = doc.querySelector(violation.elementb);
        if (el) {
          el.style.position = 'relative';
          return {
            selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
            styles: { position: 'relative' }
          };
        }
        return null;
      }).filter(Boolean);
    },

    checkscrollabilitydoc: function(doc) {
      return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
        var s = el.style;
        return s && (s.overflow === 'auto' || s.overflow === 'scroll') && !s.touchAction;
      }).map(function(el) {
        return { element: el.tagName + (el.id ? '#' + el.id : '') };
      });
    },

    correctscrollabilitydoc: function(doc, layoutcorrection) {
      return layoutcorrection.checkscrollabilitydoc(doc).map(function(violation) {
        var id = extractelementid(violation.element);
        var el = id !== null ? doc.getElementById(id) : null;
        if (!el) el = doc.querySelector(violation.element);
        if (el) {
          el.style.touchAction = 'pan-y';
          return {
            selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
            styles: { touchAction: 'pan-y' }
          };
        }
        return null;
      }).filter(Boolean);
    },

    checkcontrolledoverlaydoc: function(doc) {
      return Array.prototype.slice.call(doc.getElementsByTagName('*')).filter(function(el) {
        var s = el.style;
        return s && (s.position === 'absolute' || s.position === 'fixed') && !s.zIndex;
      }).map(function(el) {
        return { element: el.tagName + (el.id ? '#' + el.id : '') };
      });
    },

    correctcontrolledoverlaydoc: function(doc, layoutcorrection) {
      return layoutcorrection.checkcontrolledoverlaydoc(doc).map(function(violation) {
        var id = extractelementid(violation.element);
        var el = id !== null ? doc.getElementById(id) : null;
        if (!el) el = doc.querySelector(violation.element);
        if (el) {
          el.style.zIndex = '10';
          return {
            selector: el.id ? { id: el.id } : { tag: el.tagName.toLowerCase() },
            styles: { zIndex: '10' }
          };
        }
        return null;
      }).filter(Boolean);
    },

    optimizelayouthtml: function(html, goals, maxiterations, options, stylizercore, layoutdirectivecore, layoutcorrection) {
      if (maxiterations === undefined) maxiterations = 5;
      if (options === undefined) options = {};

      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var allrules = [];
      var viewportwidth = options.viewportwidth !== undefined ? options.viewportwidth : 1024;
      var containerwidths = options.containerwidths !== undefined ? options.containerwidths : {};

      function runiteration(iter) {
        if (iter >= maxiterations) return;
        var anycorrection = false;

        goals.forEach(function(goal) {
          if (goal.type === 'overflow') return;

          // ---- OP-091: table-driven dispatch ----
          var handler = goalhandlers[goal.type];
          if (!handler) return;

          var correctfn = handler(doc, goal, stylizercore, layoutcorrection);
          if (correctfn) {
            allrules = allrules.concat(correctfn());
            anycorrection = true;
          }
        });

        if (anycorrection) runiteration(iter + 1);
      }

      runiteration(0);

      var overflowviolations = layoutcorrection.checkoverflowdoc(doc, viewportwidth, containerwidths, stylizercore, layoutcorrection);
      if (overflowviolations.length) {
        allrules = allrules.concat(layoutcorrection.correctoverflowdoc(doc, overflowviolations));
      }

      return { html: doc.body.innerHTML, rules: allrules };
    }
  };

  return {
    layoutdirectivecore: layoutdirectivecore,
    layoutcorrection: layoutcorrection,
    layoutdirectivecorealias: layoutdirectivecore,
    layoutcorrectionalias: layoutcorrection
  };
}
