function cssvalue(value) {
  return String(value).split('').filter(function(ch) {
    return ch !== '\\' && ch !== '"' && ch !== "'";
  }).join('');
}

function gettagstyle(tag, tokens) {
  var style = {
    color: tokens.text,
    fontFamily: "'Georgia', serif",
    fontSize: '1rem',
    lineHeight: '1.6'
  };

  switch (tag) {
    case 'div':
    case 'section':
    case 'article':
    case 'header':
    case 'footer':
    case 'nav':
    case 'main':
    case 'aside':
      style.backgroundColor = tokens.bg;
      break;
    case 'h1':
      style.fontSize = '2.5rem';
      style.fontWeight = '800';
      style.color = tokens.accent;
      break;
    case 'h2':
      style.fontSize = '1.8rem';
      style.fontWeight = '700';
      style.color = tokens.accent;
      break;
    case 'h3':
      style.fontSize = '1.5rem';
      style.fontWeight = '600';
      style.color = tokens.accent;
      break;
    case 'h4':
      style.fontSize = '1.3rem';
      style.fontWeight = '600';
      break;
    case 'h5':
      style.fontSize = '1.1rem';
      style.fontWeight = '500';
      break;
    case 'h6':
      style.fontSize = '1rem';
      style.fontWeight = '500';
      break;
    case 'strong':
      style.fontWeight = 'bold';
      style.color = tokens.accent;
      break;
    case 'em':
      style.fontStyle = 'italic';
      break;
    case 'a':
      style.color = tokens.accent;
      style.textDecoration = 'underline';
      style.cursor = 'pointer';
      style.outline = '2px solid ' + tokens.focusOutline;
      style.outlineOffset = '2px';
      break;
    case 'button':
      style.background = tokens.accent;
      style.color = '#000000';
      style.border = 'none';
      style.borderRadius = '6px';
      style.padding = '0.5rem 1rem';
      style.cursor = 'pointer';
      style.fontFamily = 'inherit';
      style.fontSize = '1rem';
      style.outline = '2px solid ' + tokens.focusOutline;
      style.outlineOffset = '2px';
      break;
    case 'input':
    case 'select':
    case 'textarea':
      style.background = tokens.surface;
      style.color = tokens.text;
      style.border = '1px solid ' + tokens.border;
      style.borderRadius = '6px';
      style.padding = '0.5rem';
      style.fontSize = '1rem';
      style.fontFamily = 'inherit';
      style.outline = '2px solid ' + tokens.focusOutline;
      style.outlineOffset = '2px';
      break;
    case 'option':
      style.background = tokens.surface;
      style.color = tokens.text;
      break;
    case 'label':
      style.display = 'block';
      style.marginBottom = '0.25rem';
      break;
    case 'table':
      style.borderCollapse = 'collapse';
      style.width = '100%';
      break;
    case 'th':
      style.background = tokens.accent;
      style.color = tokens.bg;
      style.padding = '0.5rem';
      style.textAlign = 'left';
      break;
    case 'td':
      style.borderBottom = '1px solid ' + tokens.border;
      style.padding = '0.5rem';
      break;
    case 'pre':
      style.background = tokens.codeBg;
      style.color = tokens.codeText;
      style.padding = '0.75rem';
      style.borderRadius = '6px';
      style.overflowX = 'auto';
      break;
    case 'code':
      style.background = tokens.codeBg;
      style.color = tokens.codeText;
      style.padding = '0.125rem 0.25rem';
      style.borderRadius = '4px';
      style.fontSize = '0.9em';
      break;
    case 'blockquote':
      style.borderLeft = '3px solid ' + tokens.accent;
      style.paddingLeft = '1rem';
      style.marginLeft = '0';
      break;
    case 'hr':
      style.border = '1px solid ' + tokens.border;
      break;
  }

  var jstocss = {
    color: 'color',
    backgroundColor: 'background-color',
    background: 'background',
    opacity: 'opacity',
    fontFamily: 'font-family',
    fontSize: 'font-size',
    fontWeight: 'font-weight',
    fontStyle: 'font-style',
    lineHeight: 'line-height',
    textDecoration: 'text-decoration',
    textAlign: 'text-align',
    letterSpacing: 'letter-spacing',
    wordSpacing: 'word-spacing',
    textTransform: 'text-transform',
    fontVariant: 'font-variant',
    display: 'display',
    width: 'width',
    maxWidth: 'max-width',
    minWidth: 'min-width',
    height: 'height',
    maxHeight: 'max-height',
    minHeight: 'min-height',
    margin: 'margin',
    marginTop: 'margin-top',
    marginRight: 'margin-right',
    marginBottom: 'margin-bottom',
    marginLeft: 'margin-left',
    padding: 'padding',
    paddingTop: 'padding-top',
    paddingRight: 'padding-right',
    paddingBottom: 'padding-bottom',
    paddingLeft: 'padding-left',
    boxSizing: 'box-sizing',
    border: 'border',
    borderTop: 'border-top',
    borderRight: 'border-right',
    borderBottom: 'border-bottom',
    borderLeft: 'border-left',
    borderRadius: 'border-radius',
    borderColor: 'border-color',
    borderWidth: 'border-width',
    borderStyle: 'border-style',
    position: 'position',
    top: 'top',
    right: 'right',
    bottom: 'bottom',
    left: 'left',
    zIndex: 'z-index',
    overflow: 'overflow',
    overflowX: 'overflow-x',
    overflowY: 'overflow-y',
    whiteSpace: 'white-space',
    flex: 'flex',
    flexDirection: 'flex-direction',
    flexWrap: 'flex-wrap',
    justifyContent: 'justify-content',
    alignItems: 'align-items',
    alignContent: 'align-content',
    gap: 'gap',
    order: 'order',
    cursor: 'cursor',
    boxShadow: 'box-shadow',
    transform: 'transform',
    transition: 'transition',
    filter: 'filter',
    outline: 'outline',
    outlineOffset: 'outline-offset',
    borderCollapse: 'border-collapse',
    wordBreak: 'word-break',
    overflowWrap: 'overflow-wrap',
    textOverflow: 'text-overflow',
    pointerEvents: 'pointer-events',
    userSelect: 'user-select'
  };

  return Object.keys(style).map(function(prop) {
    var cssprop = jstocss[prop] || prop;
    return cssprop + ': ' + cssvalue(style[prop]);
  }).join('; ');
}

function generatethemereference(theme) {
  var alltags = [
    'div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'span', 'strong', 'em', 'u', 's', 'mark', 'small', 'sub', 'sup',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
    'a', 'button', 'input', 'textarea', 'select', 'option', 'label',
    'pre', 'code', 'kbd', 'samp',
    'blockquote', 'q', 'hr', 'img', 'figure', 'figcaption'
  ];

  var themetokencolors = {
    dark: {
      bg: '#0f172a',
      text: '#f8fafc',
      accent: '#f59e0b',
      surface: '#1e293b',
      border: '#334155',
      codeBg: '#0d1117',
      codeText: '#c9d1d9',
      focusOutline: '#f59e0b'
    },
    light: {
      bg: '#fef3c7',
      text: '#1e293b',
      accent: '#d97706',
      surface: '#ffffff',
      border: '#d4a373',
      codeBg: '#1e293b',
      codeText: '#f8fafc',
      focusOutline: '#d97706'
    }
  };

  var tokens = themetokencolors[theme] || themetokencolors.dark;

  var html = '<div id="theme-reference" style="font-family: \'Georgia\', serif; font-size: 16px; color: ' + cssvalue(tokens.text) + '; background-color: ' + cssvalue(tokens.bg) + ';">';
  html += '<div style="background-color: ' + cssvalue(tokens.bg) + '; color: ' + cssvalue(tokens.text) + '; font-family: \'Georgia\', serif; font-size: 16px;"></div>';

  html += alltags.filter(function(tag) {
    return tag !== 'div';
  }).map(function(tag) {
    var stylestr = gettagstyle(tag, tokens);
    if (tag === 'img' || tag === 'hr' || tag === 'input') {
      return '<' + tag + ' style="' + stylestr + '" />';
    }
    return '<' + tag + ' style="' + stylestr + '"></' + tag + '>';
  }).join('');

  html += '</div>';
  return html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cssvalue: cssvalue,
    gettagstyle: gettagstyle,
    generatethemereference: generatethemereference
  };
}

