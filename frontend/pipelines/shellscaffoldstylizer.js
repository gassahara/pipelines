function applyshelltheme(contenthtml, referencehtml, frameworkfunctions, parser) {
  var stylizercore = frameworkfunctions.stylizercore;
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var colorcore = frameworkfunctions.colorcore;
  var colorharmony = frameworkfunctions.colorharmony;
  var colorcontrast = frameworkfunctions.colorcontrast;

  var domparserctor = parser;
  if (!domparserctor || typeof domparserctor !== 'function') {
    throw new Error('[applyshelltheme] DOMParser not available; provide a parser.');
  }

  var extractallfn = stylizerrewrite.extractalltagstyles || stylizerrewrite.extractAllTagStyles;
  var themestyles = extractallfn ? extractallfn.call(stylizerrewrite, referencehtml, stylizercore) : {};

  var rootstyles = themestyles.root || {};
  var divstyles = themestyles.div || {};

  var bg = divstyles.backgroundColor || rootstyles.backgroundColor || '#0f172a';
  var text = divstyles.color || rootstyles.color || '#f8fafc';

  var accent = '#f59e0b';
  if (themestyles.h2 && themestyles.h2.color) {
    accent = themestyles.h2.color;
  }

  var bordercolor = '#334155';
  if (themestyles.td && themestyles.td.borderBottomColor) {
    bordercolor = themestyles.td.borderBottomColor;
  }

  var fontfamily = divstyles.fontFamily || rootstyles.fontFamily || "'Georgia', serif";
  var fontsize = divstyles.fontSize || rootstyles.fontSize || '1rem';

  var visualkeys = [
    'color', 'backgroundColor', 'background', 'fontFamily', 'fontSize',
    'fontWeight', 'fontStyle', 'textDecoration', 'opacity',
    'letterSpacing', 'wordSpacing', 'textTransform', 'fontVariant'
  ];

  function buildvisualstyle(tag, keys, index, acc) {
    if (index >= keys.length) return acc;
    var key = keys[index];
    if (themestyles[tag] && themestyles[tag][key] !== undefined) {
      acc[key] = themestyles[tag][key];
    }
    return buildvisualstyle(tag, keys, index + 1, acc);
  }

  function buildbaserules(tags, index, acc) {
    if (index >= tags.length) return acc;
    var tag = tags[index];
    if (tag === 'root') return buildbaserules(tags, index + 1, acc);
    return buildbaserules(
      tags,
      index + 1,
      acc.concat([{ tag: tag, style: buildvisualstyle(tag, visualkeys, 0, {}) }])
    );
  }

  var baserules = buildbaserules(Object.keys(themestyles), 0, []);

  var sidebarbg = colorharmony.pick(
    colorharmony.monochromatic(bg, 5, undefined, colorcore),
    0
  );

  var togglebg = colorcontrast.contrastingLevel(
    colorharmony.complementary(accent, colorharmony, colorcore),
    bg,
    80,
    colorcontrast,
    colorcore
  );

  var toggletext = colorcontrast.computeForeground(
    text,
    togglebg,
    undefined,
    colorcontrast,
    colorcore
  );

  var harmonicrules = [
    { id: 'shellroot', style: { background: bg, color: text, fontFamily: fontfamily, fontSize: fontsize } },
    { id: 'shellsidebar', style: { background: sidebarbg } },
    { id: 'sidebarheader', style: {} },
    { id: 'sidebarstatus', style: {} },
    { id: 'sidebartoggle', style: { background: togglebg, color: toggletext } },
    { id: 'shellworkspace', style: { background: bg, color: text } }
  ];

  var modifiedhtml = stylizerrewrite.rewritestyleattrs(
    contenthtml,
    baserules.concat(harmonicrules),
    stylizercore
  );

  var consolidatefn = stylizerrewrite.consolidatestyles || stylizerrewrite.consolidateStyles;
  if (consolidatefn) {
    modifiedhtml = consolidatefn.call(stylizerrewrite, modifiedhtml, stylizercore);
  }

  var optimizestylefn = stylizerrewrite.optimizestylehtml || stylizerrewrite.optimizeStyleHTML;
  var optimized = optimizestylefn.call(
    stylizerrewrite,
    modifiedhtml,
    [
      { type: 'contrast', options: { minRatio: 4.5 } },
      { type: 'harmony' },
      { type: 'textVisibility', options: { minFontSize: 12, minLineHeight: 1.2 } },
      { type: 'buttonVisibility' }
    ],
    themestyles,
    5,
    stylizercore
  );

  return optimized.html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyshelltheme: applyshelltheme
  };
}

