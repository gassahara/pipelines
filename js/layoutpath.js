function getAncestors(el) {
  const ancestors = [];
  let p = el.parentNode;
  while (p) {
    if (p.nodeType === 1) ancestors.push(p);
    p = p.parentNode;
  }
  return ancestors;
}

function getAllDescendants(el) {
  const result = [];
  const stack = Array.from(el.children || []);
  while (stack.length) {
    const child = stack.shift();
    result.push(child);
    if (child.children) stack.unshift(...child.children);
  }
  return result;
}

function getNextSiblings(el) {
  const siblings = [];
  let sib = el.nextSibling;
  while (sib) {
    if (sib.nodeType === 1) siblings.push(sib);
    sib = sib.nextSibling;
  }
  return siblings;
}

function getPreviousSiblings(el) {
  const siblings = [];
  let sib = el.previousSibling;
  while (sib) {
    if (sib.nodeType === 1) siblings.push(sib);
    sib = sib.previousSibling;
  }
  return siblings;
}

function getDepth(ancestor, descendant) {
  let depth = 0;
  let current = descendant;
  while (current && current !== ancestor) {
    if (current.nodeType === 1) depth++;
    current = current.parentNode;
  }
  return current === ancestor ? depth : -1;
}

function applyStep(nodes, step) {
  const next = [];
  for (const node of nodes) {
    let candidates = [];
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
        throw new Error(`Unknown axis: ${step.axis}`);
    }

    // Apply tag/class/id/index/depth/skip filters (unchanged)
    if (step.tag) {
      candidates = candidates.filter(
        el => el.tagName && el.tagName.toLowerCase() === step.tag.toLowerCase()
      );
    }
    if (step.class) {
      candidates = candidates.filter(
        el => el.classList && el.classList.contains(step.class)
      );
    }
    if (step.id) {
      candidates = candidates.filter(el => el.id === step.id);
    }
    if (step.index !== undefined) {
      candidates = (candidates.length > step.index) ? [candidates[step.index]] : [];
    }
    if (step.depth !== undefined && step.axis === 'descendant') {
      candidates = candidates.filter(el => getDepth(node, el) === step.depth);
    }
    if (
      step.skip !== undefined &&
      (step.axis === 'nextSibling' || step.axis === 'previousSibling')
    ) {
      candidates = (candidates.length > step.skip) ? [candidates[step.skip]] : [];
    }

    // — NEW: content filter —
    if (step.content) {
      const { text, mode = 'substring', caseSensitive = false } = step.content;
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      let contentFilter;
      if (caseSensitive) {
        switch (mode) {
          case 'substring':
            contentFilter = el => el.textContent.includes(text);
            break;
          case 'word':
            contentFilter = el => new RegExp('\\b' + escapeRegex(text) + '\\b').test(el.textContent);
            break;
          case 'exact':
            contentFilter = el => el.textContent.trim() === text.trim();
            break;
          case 'regex':
            contentFilter = el => new RegExp(text).test(el.textContent);
            break;
          default:
            throw new Error(`Unknown content match mode: ${mode}`);
        }
      } else {
        const lowerText = text.toLowerCase();
        switch (mode) {
          case 'substring':
            contentFilter = el => el.textContent.toLowerCase().includes(lowerText);
            break;
          case 'word':
            contentFilter = el => new RegExp('\\b' + escapeRegex(text) + '\\b', 'i').test(el.textContent);
            break;
          case 'exact':
            contentFilter = el => el.textContent.trim().toLowerCase() === lowerText.trim();
            break;
          case 'regex':
            contentFilter = el => new RegExp(text, 'i').test(el.textContent);
            break;
          default:
            throw new Error(`Unknown content match mode: ${mode}`);
        }
      }
      candidates = candidates.filter(contentFilter);
    }

    // Accumulate
    for (const c of candidates) {
      if (!next.includes(c)) next.push(c);
    }
  }
  return next;
}

export function resolvePath(root, steps) {
  let currentNodes = [root];
  for (const step of steps) {
    currentNodes = applyStep(currentNodes, step);
  }
  return currentNodes;
}
