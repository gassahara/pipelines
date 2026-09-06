function hasown(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isarray(value) {
  return Object.prototype.toString.call(value) === '[object Array]';
}

function containsitem(arr, item) {
  return arr.some(function(entry) { return entry === item; });
}

function escapehtml(text) {
  var str = String(text);
  var escapemap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.split('').map(function(ch) {
    return escapemap[ch] !== undefined ? escapemap[ch] : ch;
  }).join('');
}

function cleanmarkdown(text) {
  var str = String(text);
  return str.split('').filter(function(ch, i) {
    return !(ch === '*' && i + 1 < str.length && str.charAt(i + 1) === '*');
  }).join('');
}

function isheadingtype(str) {
  if (typeof str !== 'string') return false;
  if (str.length !== 2) return false;
  var first = str.charAt(0);
  var second = str.charAt(1);
  if (first !== 'h' && first !== 'H') return false;
  return ['1', '2', '3', '4', '5', '6'].some(function(digit) { return second === digit; });
}

var astrender = {
  styles: {
    dice: 'width:min(100%,900px);max-height:85vh;border-radius:48px;padding:2rem 2rem 1.8rem;position:relative;overflow:scroll;box-sizing:border-box;',
    content: 'overflow-y:auto;overflow-x:hidden;padding-right:0.6rem;height:100%;font-family:inherit;line-height:1.6;',
    h1: 'font-size:2.2em;font-weight:800;text-align:center;margin:0 0 25px 0;padding-bottom:15px;letter-spacing:-0.5px;',
    h2: 'font-size:1.7em;font-weight:700;margin:25px 0 15px 0;padding:8px 15px;',
    h3: 'font-size:1.3em;font-weight:650;margin:20px 0 12px 0;padding:5px 12px;border-radius:20px;display:inline-block;',
    property: 'border-radius:12px;padding:12px 18px;margin:8px 0;',
    propertykey: 'font-weight:700;font-family:inherit;padding:3px 10px;border-radius:20px;font-size:0.9em;letter-spacing:0.3px;',
    propertyvalue: 'line-height:1.5;',
    table: 'width:100%;border-collapse:collapse;font-size:0.9em;border-radius:16px;overflow:hidden;',
    th: 'padding:12px 15px;text-align:left;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;font-size:0.85em;',
    td: 'padding:10px 15px;',
    list: 'margin:10px 0 10px 20px;padding:0;list-style:none;',
    listitem: 'margin:6px 0;padding:8px 15px 8px 30px;border-radius:10px;position:relative;',
    paragraph: 'font-style:italic;padding:5px 15px;margin:5px 0;border-radius:0 8px 8px 0;',
    nested: 'margin-left:20px;padding-left:15px;',
    badge: 'display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;font-size:0.8em;margin-left:10px;',
    code: 'padding:15px 20px;border-radius:12px;font-family:monospace;font-size:0.75em;line-height:1.6;white-space:pre-wrap;margin:10px 0;overflow-x:auto;',
    inlinecode: 'padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.85em;',
    orderedlist: 'margin:10px 0;padding-left:25px;list-style:decimal;'
  },

  metadataroles: {
    type: true,
    level: true,
    depth: true,
    ordered: true,
    separator: true,
    format: true
  },

  classifySingleField: function(key, val) {
    if (key === 'children' && isarray(val)) return { role: 'children', key: key, value: val };
    if (key === 'headers' && isarray(val)) return { role: 'headers', key: key, value: val };
    if (key === 'rows' && isarray(val)) return { role: 'rows', key: key, value: val };
    if (key === 'text' && typeof val === 'string') return { role: 'text', key: key, value: val };
    if (key === 'key' && typeof val === 'string') return { role: 'key', key: key, value: val };
    if (key === 'value') return { role: 'value', key: key, value: val };
    if (key === 'type') return { role: 'type', key: key, value: val };
    if (key === 'level' && typeof val === 'number') return { role: 'level', key: key, value: val };
    if (key === 'depth' && typeof val === 'number') return { role: 'depth', key: key, value: val };
    if (key === 'ordered' && typeof val === 'boolean') return { role: 'ordered', key: key, value: val };
    if (key === 'separator' && typeof val === 'string') return { role: 'separator', key: key, value: val };
    if (isarray(val)) return { role: 'children', key: key, value: val };
    if (typeof val === 'object' && val !== null) return { role: 'node', key: key, value: val };
    return { role: 'text', key: key, value: val };
  },

  classifyFields: function(node) {
    return Object.keys(node).reduce(function(acc, key) {
      var result = astrender.classifySingleField(key, node[key]);
      return result === null ? acc : acc.concat([result]);
    }, []);
  },

  fieldrenderers: {
    type: function() { return ''; },
    level: function() { return ''; },
    depth: function() { return ''; },
    ordered: function() { return ''; },
    separator: function() { return ''; },
    format: function() { return ''; },

    text: function(k, v) {
      return escapehtml(cleanmarkdown(String(v)));
    },

    key: function(k, v) {
      return '<span style="' + astrender.styles.propertykey + '">' +
        escapehtml(cleanmarkdown(String(v))) +
        '</span>';
    },

    value: function(k, v, depth, options, parentnode) {
      if (typeof v === 'string' && v.indexOf('\n') !== -1) {
        return '<pre style="' + astrender.styles.code + '">' +
          escapehtml(cleanmarkdown(v)) +
          '</pre>';
      }
      return astrender.renderNode(v, depth + 1, options, parentnode);
    },

    children: function(k, v, depth, options, parentnode) {
      return (v || []).map(function(item) {
        return astrender.renderNode(item, depth + 1, options, parentnode);
      }).join('');
    },

    headers: function(k, v) {
      return '<thead><tr>' + (v || []).map(function(item) {
        return '<th style="' + astrender.styles.th + '">' +
          escapehtml(String(item)) +
          '</th>';
      }).join('') + '</tr></thead>';
    },

    rows: function(k, v, depth, options, parentnode) {
      return '<tbody>' + (v || []).map(function(row) {
        if (isarray(row)) {
          return '<tr>' + row.map(function(cell) {
            return '<td style="' + astrender.styles.td + '">' +
              astrender.renderNode(cell, depth + 1, options, parentnode) +
              '</td>';
          }).join('') + '</tr>';
        }
        return '<tr><td style="' + astrender.styles.td + '">' +
          astrender.renderNode(row, depth + 1, options, parentnode) +
          '</td></tr>';
      }).join('') + '</tbody>';
    },

    node: function(k, v, depth, options, parentnode) {
      return astrender.renderNode(v, depth, options, parentnode);
    },

    defaultrenderer: function(k, v) {
      return escapehtml(cleanmarkdown(String(v)));
    }
  },

  renderField: function(role, key, value, depth, options, parentnode) {
    var handler = astrender.fieldrenderers[role] || astrender.fieldrenderers.defaultrenderer;
    return handler(key, value, depth, options, parentnode);
  },

  someField: function(fields, predicate) {
    return fields.some(predicate);
  },

  findField: function(fields, predicate) {
    var found = fields.filter(predicate);
    return found.length ? found[0] : undefined;
  },

  resolveContainer: function(fields, node, depth, parentnode) {
    var haschildren = astrender.someField(fields, function(f) { return f.role === 'children'; });
    var hasheaders = astrender.someField(fields, function(f) { return f.role === 'headers'; });
    var hasrows = astrender.someField(fields, function(f) { return f.role === 'rows'; });
    var haskey = astrender.someField(fields, function(f) { return f.role === 'key'; });
    var hasvalue = astrender.someField(fields, function(f) { return f.role === 'value'; });
    var hastext = astrender.someField(fields, function(f) { return f.role === 'text'; });

    var typefield = astrender.findField(fields, function(f) { return f.role === 'type'; });
    var typevalue = typefield ? typefield.value : '';
    var hascodeformat = typevalue === 'code' || typevalue === 'code_block' || typevalue === 'pre';

    var levelfield = astrender.findField(fields, function(f) { return f.role === 'level'; });
    var level = levelfield ? Math.min(levelfield.value || 1, 6) : null;

    var orderedfield = astrender.findField(fields, function(f) { return f.role === 'ordered'; });
    var ordered = orderedfield ? orderedfield.value : false;

    if (hasheaders && hasrows) {
      return {
        tag: 'table',
        style: astrender.styles.table,
        wrapperTag: 'div',
        wrapperStyle: 'overflow-x:auto;margin:15px 0;border-radius:16px;'
      };
    }

    if (level !== null || isheadingtype(typevalue)) {
      var effectivelevel = level || parseInt(typevalue.charAt(1), 10) || 1;
      var headingtag = 'h' + Math.min(effectivelevel, 6);
      var headingstyle = astrender.styles[headingtag] || astrender.styles.h3;
      return { tag: headingtag, style: headingstyle };
    }

    if (haschildren && orderedfield) {
      return {
        tag: ordered ? 'ol' : 'ul',
        style: ordered ? astrender.styles.orderedlist : astrender.styles.list
      };
    }

    if (haschildren && typevalue === 'list_item') {
      return { tag: 'li', style: astrender.styles.listitem };
    }

    if (hascodeformat && hastext) {
      return { tag: 'pre', style: astrender.styles.code };
    }

    if (haskey && hasvalue) {
      var parenttype = parentnode && parentnode.type ? parentnode.type : '';
      if (isheadingtype(parenttype)) {
        return { tag: 'span', style: astrender.styles.badge };
      }
      return { tag: 'div', style: astrender.styles.property };
    }

    if (hastext && !haskey && !hasheaders) {
      return { tag: 'p', style: astrender.styles.paragraph };
    }

    if (haschildren) {
      return { tag: 'div', style: astrender.styles.nested };
    }

    if (hastext) {
      return { tag: 'span', style: astrender.styles.propertyvalue };
    }

    return { tag: null, style: '' };
  },

  renderNode: function(node, depth, options, parentnode) {
    if (depth === undefined) depth = 0;
    if (options === undefined) options = {};
    if (parentnode === undefined) parentnode = null;

    if (node === null || node === undefined) return '';
    if (typeof node !== 'object') return escapehtml(cleanmarkdown(String(node)));

    if (isarray(node)) {
      return node.map(function(item) {
        return astrender.renderNode(item, depth, options, parentnode);
      }).join('');
    }

    var fields = astrender.classifyFields(node);
    var container = astrender.resolveContainer(fields, node, depth, parentnode);

    var content = fields.reduce(function(acc, field) {
      if (astrender.metadataroles[field.role] === true) return acc;
      return acc + astrender.renderField(field.role, field.key, field.value, depth, options, node);
    }, '');

    if (container.tag === null) return content;

    var styleattr = container.style ? ' style="' + container.style + '"' : '';
    var htmlout = '<' + container.tag + styleattr + '>' + content + '</' + container.tag + '>';

    if (container.wrapperTag) {
      var wrapperstyle = container.wrapperStyle ? ' style="' + container.wrapperStyle + '"' : '';
      htmlout = '<' + container.wrapperTag + wrapperstyle + '>' + htmlout + '</' + container.wrapperTag + '>';
    }

    return htmlout;
  },

  asttodiv: function(ast, options) {
    if (options === undefined) options = {};
    if (!ast || !isarray(ast.children)) {
      if (options.onError) options.onError('[asttodiv] Invalid AST: missing children array', ast);
      return '<!-- ERROR: Invalid AST -->';
    }
    var dicehtml = '\n    <div style="' + astrender.styles.dice + '">\n' +
      '        <div style="' + astrender.styles.content + '">';
    dicehtml += ast.children.map(function(child) {
      return astrender.renderNode(child, 0, options, null);
    }).join('');
    dicehtml += '\n        </div>\n    </div>';
    return dicehtml;
  }
};

var astextract = {
  getBlocks: function(nodes) {
    return nodes.reduce(function(acc, node) {
      if (!node) return acc;

      if (node.type === 'list' && isarray(node.items)) {
        var blocks = node.items.reduce(function(inneracc, item) {
          var next = inneracc.concat([item]);
          if (isarray(item.content)) {
            item.content.forEach(function(inner) {
              if (inner.type === 'list') {
                next = next.concat(astextract.getBlocks(inner.items));
              }
            });
          }
          return next;
        }, []);
        return acc.concat(blocks);
      }

      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') {
        return acc.concat([node]);
      }

      return acc;
    }, []);
  },

  getPlainText: function(node) {
    if (typeof node === 'string') return node;
    if (node.type === 'text') return node.text;

    var text = '';
    if (isarray(node.content)) {
      text = node.content.reduce(function(acc, child) {
        return acc + astextract.getPlainText(child);
      }, '');
    }
    if (isarray(node.items)) {
      text += node.items.reduce(function(acc, item) {
        return acc + astextract.getPlainText(item) + '\n';
      }, '');
    }
    return text;
  },

  isKeyBlock: function(block) {
    if (!isarray(block.content)) return false;

    var keynode = null;
    var othertext = '';

    block.content.forEach(function(node) {
      if (node.type === 'text') {
        var trimmed = node.text.trim();
        if (trimmed.length === 0) return;
        if (isarray(node.formats) && containsitem(node.formats, 'key')) {
          if (keynode) return false;
          keynode = node;
        } else {
          othertext += node.text;
        }
      } else if (isarray(node.content)) {
        othertext += astextract.getPlainText(node);
      }
    });

    return keynode !== null && othertext.trim() === '';
  },

  storeValue: function(result, key, value) {
    if (!hasown(result, key)) {
      result[key] = value;
      return;
    }
    if (!isarray(result[key])) result[key] = [result[key]];
    result[key].push(value);
  },

  processInlineBlock: function(block, result) {
    var significant = block.content.reduce(function(acc, node) {
      if (node.type === 'text') {
        if (node.text.trim().length > 0) acc.push(node);
      } else {
        acc.push(node);
      }
      return acc;
    }, []);

    var pendingkey = null;

    significant.forEach(function(node, index) {
      if (node.type === 'text' && isarray(node.formats) && containsitem(node.formats, 'key')) {
        var keytext = node.text.trim();
        if (index + 1 < significant.length) {
          var nextnode = significant[index + 1];
          var nextiskey = nextnode.type === 'text' &&
            isarray(nextnode.formats) &&
            containsitem(nextnode.formats, 'key');
          if (!nextiskey) {
            astextract.storeValue(result, keytext, astextract.getPlainText(nextnode).trim());
          } else {
            astextract.storeValue(result, keytext, null);
          }
        } else {
          pendingkey = keytext;
        }
      }
    });

    return pendingkey;
  },

  extractKeyValues: function(ast) {
    var result = {};
    var blocks = astextract.getBlocks(ast);

    blocks.forEach(function(block, index) {
      if (astextract.isKeyBlock(block)) {
        var keytext = '';
        block.content.some(function(node) {
          if (node.type === 'text' && isarray(node.formats) && containsitem(node.formats, 'key')) {
            keytext = node.text.trim();
            return true;
          }
          return false;
        });

        var value = null;
        if (index + 1 < blocks.length) {
          var nextblock = blocks[index + 1];
          if (!astextract.isKeyBlock(nextblock)) {
            value = astextract.getPlainText(nextblock).trim();
          }
        }
        astextract.storeValue(result, keytext, value);
      } else {
        var pendingkey = astextract.processInlineBlock(block, result);
        if (pendingkey) {
          var value2 = null;
          if (index + 1 < blocks.length) {
            var nextblock2 = blocks[index + 1];
            if (!astextract.isKeyBlock(nextblock2)) {
              value2 = astextract.getPlainText(nextblock2).trim();
            }
          }
          astextract.storeValue(result, pendingkey, value2);
        }
      }
    });

    return result;
  },

  cleanobject: function(obj, leavekey) {
    if (obj === null || typeof obj !== 'object') return null;

    var retobj = {};
    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      if (value == null || value === []) return;

      if (typeof value === 'object') {
        var tempret = astextract.cleanobject(value, leavekey);
        if (tempret && Object.keys(tempret).length > 0) retobj[key] = tempret;
      } else {
        if (leavekey) {
          if (key === leavekey && value.trim() !== 'NA' && value.trim() !== 'N/A' && value.trim() !== '') {
            retobj[key] = value;
          }
        } else {
          if (value.trim() !== 'NA' && value.trim() !== 'N/A' && value.trim() !== '') {
            retobj[key] = value;
          }
        }
      }
    });

    return retobj;
  },

  kvobject: function(obj, leavekeyname, leavevaluename, rut) {
    if (rut === undefined) rut = '';
    var retobj = [];

    Object.keys(obj).forEach(function(key) {
      var value = obj[key];
      var currentrut = rut + key + ',';
      if (value == null || value === []) return;

      if (typeof value === 'object') {
        retobj = retobj.concat(astextract.kvobject(value, leavekeyname, leavevaluename, currentrut));
      } else {
        if (key === leavevaluename && value.trim() !== 'NA' && value.trim() !== 'N/A' && value.trim() !== '') {
          var objx = {};
          objx[key] = value.trim();
          objx.rut = currentrut;
          retobj.push(objx);
        }
      }
    });

    return retobj;
  },

  planarExtraction: function(extract) {
    return Object.keys(extract).reduce(function(acc, key) {
      var value = extract[key];
      if (typeof value === 'string') return acc.concat([value]);
      return acc.concat(astextract.planarExtraction(value));
    }, []).filter(function(item) {
      return String(item).trim() !== '';
    });
  },

  findKeyValue: function(obj, targetkey, targetvalue, keys) {
    if (keys === undefined) keys = [];
    if (obj === null || typeof obj !== 'object') return null;

    if (hasown(obj, targetkey)) {
      if (String(obj[targetkey]).toLowerCase().indexOf(String(targetvalue).toLowerCase()) > -1) {
        return keys;
      }
    }

    var found = null;
    Object.keys(obj).some(function(key) {
      var value = obj[key];
      if (typeof value === 'object') {
        var result = astextract.findKeyValue(value, targetkey, targetvalue, keys.concat([key]));
        if (result !== null) {
          found = result;
          return true;
        }
      }
      return false;
    });

    return found;
  }
};

astrender.classifysinglefield = astrender.classifySingleField;
astrender.classifyfields = astrender.classifyFields;
astrender.renderfield = astrender.renderField;
astrender.somefield = astrender.someField;
astrender.findfield = astrender.findField;
astrender.resolvecontainer = astrender.resolveContainer;
astrender.rendernode = astrender.renderNode;

astextract.getblocks = astextract.getBlocks;
astextract.getplaintext = astextract.getPlainText;
astextract.iskeyblock = astextract.isKeyBlock;
astextract.storevalue = astextract.storeValue;
astextract.processinlineblock = astextract.processInlineBlock;
astextract.extractkeyvalues = astextract.extractKeyValues;
astextract.planarextraction = astextract.planarExtraction;
astextract.findkeyvalue = astextract.findKeyValue;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    astrender: astrender,
    astextract: astextract
  };
}

