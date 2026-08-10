import { logdebug, getverbosity, VERBOSITY } from '../verbosity.js';

// ==================== RECURSIVE PATH ENGINE ====================

// Recursive helpers (no loops, pure functions)
function getAncestors(el, acc) {
  if (!acc) acc = [];
  var p = el.parentNode;
  if (!p) return acc;
  var newAcc = p.nodeType === 1 ? acc.concat(p) : acc;
  return getAncestors(p, newAcc);
}

function getAllDescendants(el) {
  var children = Array.from(el.children || []);
  if (children.length === 0) return [];
  return children.reduce(function(all, child) {
    return all.concat(child, getAllDescendants(child));
  }, []);
}

function getNextSiblings(el, acc) {
  if (!acc) acc = [];
  var sib = el.nextSibling;
  if (!sib) return acc;
  var newAcc = sib.nodeType === 1 ? acc.concat(sib) : acc;
  return getNextSiblings(sib, newAcc);
}

function getPreviousSiblings(el, acc) {
  if (!acc) acc = [];
  var sib = el.previousSibling;
  if (!sib) return acc;
  var newAcc = sib.nodeType === 1 ? acc.concat(sib) : acc;
  return getPreviousSiblings(sib, newAcc);
}

// Recursive depth calculation
function getDepth(ancestor, descendant) {
  if (!descendant || descendant === ancestor) return 0;
  if (descendant.nodeType !== 1) return getDepth(ancestor, descendant.parentNode);
  return 1 + getDepth(ancestor, descendant.parentNode);
}

// Apply a single path step to an array of nodes (recursive processing)
function applyStep(nodes, step) {
  return nodes.reduce(function(next, node) {
    var candidates = [];
    switch (step.axis || 'child') {
      case 'self':
        candidates = [node];
        break;
      case 'parent':
        if (node.parentNode) candidates = [node.parentNode];
        break;
      case 'ancestor':
        candidates = getAncestors(node);
        break;
      case 'child':
        candidates = Array.from(node.children || []);
        break;
      case 'descendant':
        candidates = getAllDescendants(node);
        break;
      case 'nextSibling':
        candidates = getNextSiblings(node);
        break;
      case 'previousSibling':
        candidates = getPreviousSiblings(node);
        break;
      default:
        throw new Error('Unknown axis: ' + step.axis);
    }

    // Apply filters (tag, class, id, index, depth, skip) – declarative chaining
    if (step.tag) {
      candidates = candidates.filter(function(el) {
        return el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase();
      });
    }
    if (step.class) {
      candidates = candidates.filter(function(el) {
        return el.classList && el.classList.contains(step.class);
      });
    }
    if (step.id) {
      candidates = candidates.filter(function(el) {
        return el.id === step.id;
      });
    }
    if (step.index !== undefined) {
      candidates = candidates.length > step.index ? [candidates[step.index]] : [];
    }
    if (step.depth !== undefined && step.axis === 'descendant') {
      candidates = candidates.filter(function(el) {
        return getDepth(node, el) === step.depth;
      });
    }
    if (step.skip !== undefined &&
        (step.axis === 'nextSibling' || step.axis === 'previousSibling')) {
      candidates = candidates.length > step.skip ? [candidates[step.skip]] : [];
    }

    // — Regex‑free content filter (substring/exact only) —
    if (step.content) {
      var content = step.content;
      var text = content.text || '';
      var mode = content.mode || 'substring';
      var caseSensitive = content.caseSensitive === true;
      var search = caseSensitive ? text : text.toLowerCase();
      candidates = candidates.filter(function(el) {
        var elText = caseSensitive ? el.textContent : el.textContent.toLowerCase();
        if (mode === 'substring') return elText.indexOf(search) !== -1;
        if (mode === 'exact') return elText.trim() === search.trim();
        return false;
      });
    }

    // Accumulate unique elements
    candidates.forEach(function(c) {
      if (next.indexOf(c) === -1) next.push(c);
    });
    return next;
  }, []);
}

// Recursive path resolution
function resolvePath(root, steps) {
  return steps.reduce(function(currentNodes, step) {
    return applyStep(currentNodes, step);
  }, [root]);
}

// ==================== STYLIZER FUNCTION ====================

export function rewritestyleattrs(html, rules) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var body = doc.body;
  for (var ri = 0; ri < rules.length; ri++) {
    var rule = rules[ri];
    var els = [];
    if (rule.path) {
      els = resolvePath(body, rule.path);
    } else {
      if (rule.id)      els = [doc.getElementById(rule.id)];
      if (rule.tag)     els = doc.getElementsByTagName(rule.tag);
      if (rule.classname) els = doc.getElementsByClassName(rule.classname);
      if (rule.name)    els = [doc.getElementByName(rule.name)];
    }

    var eli = -1;
    while (eli < els.length) {
      eli = eli + 1;
      var el = els[eli];
      if (!el) continue;
      var newstyle = rule.style;
      if (newstyle) {
        var newkeys = Object.keys(newstyle);
        for (var ni = 0; ni < newkeys.length; ni++) {
          try {
            el.style[newkeys[ni]] = newstyle[newkeys[ni]];
          } catch(e) {
            console.log({e});
          }
        }
      }
    }
  }
  return body.innerHTML;
}

// ==================== COLOR SCHEME UTILITY (unchanged) ====================

export function computecolorscheme(pos, tilecols, cellw, cellh, gridcols) {
  var colstart = Math.max(0, Math.min(Math.floor((pos.clientx || 0) / cellw), gridcols - 1));
  var rowstart = Math.max(0, Math.min(Math.floor((pos.clienty || 0) / cellh), gridcols - 1));
  var colend = Math.max(1, Math.min(Math.ceil(((pos.clientx || 0) + (pos.width || cellw)) / cellw), gridcols));
  var rowend = Math.max(1, Math.min(Math.ceil(((pos.clienty || 0) + (pos.height || cellh)) / cellh), gridcols));
  var sumh = 0, sums = 0, suml = 0, count = 0;
  for (var r = rowstart; r < rowend; r++) {
    for (var c = colstart; c < colend; c++) {
      var idx = r * gridcols + c;
      if (idx < tilecols.length) {
        sumh += tilecols[idx].h;
        sums += tilecols[idx].s;
        suml += tilecols[idx].l;
        count++;
      }
    }
  }
  var avgh = count ? (sumh / count) % 360 : 0;
  var avgs = count ? sums / count : 50;
  var avgl = count ? suml / count : 50;
  var offset = (Math.floor((pos.clientx || 0) / 50) * 7 + Math.floor((pos.clienty || 0) / 50) * 13) % 60;
  var huecont = (avgh + 180 + offset) % 360;
  var satcont = avgs < 30 ? 75 : (avgs >= 50 ? 50 : 60);
  var bglight = avgl < 50 ? 75 : 25;
  var fglight = avgl < 50 ? 15 : 90;
  var borderlight = Math.round((bglight + fglight) / 2);
  return {
    background: 'hsl(' + huecont + ', ' + satcont + '%, ' + bglight + '%)',
    color: 'hsl(' + huecont + ', ' + Math.max(satcont - 10, 10) + '%, ' + fglight + '%)',
    borderColor: 'hsl(' + huecont + ', ' + satcont + '%, ' + borderlight + '%)'
  };
}

// ==================== NEW: Responsive Styles Injection ====================
export function injectResponsiveStyles(html, breakpointRules) {
  if (!breakpointRules || breakpointRules.length === 0) return html;
  let css = '<style data-responsive="true">';
  for (const bp of breakpointRules) {
    const min = bp.minWidth !== undefined ? `(min-width: ${bp.minWidth}px)` : '';
    const max = bp.maxWidth !== undefined ? `(max-width: ${bp.maxWidth}px)` : '';
    const cond = [min, max].filter(Boolean).join(' and ');
    css += `@media ${cond} {\n`;
    for (const rule of bp.rules) {
      // Build selector: prefer id, then class, then tag, else '*'
      let selector;
      if (rule.id) {
        selector = `#${rule.id}`;
      } else if (rule.class) {
        selector = `.${rule.class}`;
      } else if (rule.tag) {
        selector = rule.tag;
      } else {
        selector = '*';
      }
      css += `  ${selector} {\n`;
      for (const [prop, val] of Object.entries(rule.style)) {
        // Convert camelCase to kebab-case for CSS properties
        const kebabProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        css += `    ${kebabProp}: ${val};\n`;
      }
      css += `  }\n`;
    }
    css += `}\n`;
  }
  css += '</style>';

  // Append before the last closing </div> if possible, otherwise at the end
  const lastDivIdx = html.lastIndexOf('</div>');
  if (lastDivIdx !== -1) {
    return html.slice(0, lastDivIdx) + css + html.slice(lastDivIdx);
  }
  return html + css;
}
