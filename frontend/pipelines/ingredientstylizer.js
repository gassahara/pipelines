function applyingredientstheme(contenthtml, referencehtml, frameworkfunctions, parser) {
  var stylizercore = frameworkfunctions.stylizercore;
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var colorcore = frameworkfunctions.colorcore;
  var colorharmony = frameworkfunctions.colorharmony;
  var colorcontrast = frameworkfunctions.colorcontrast;

  var domparserctor = parser;
  if (!domparserctor || typeof domparserctor !== 'function') {
    throw new Error('[applyingredientstheme] DOMParser not available; provide a parser.');
  }

  var extractallfn = stylizerrewrite.extractalltagstyles || stylizerrewrite.extractAllTagStyles;
  var themestyles = extractallfn ? extractallfn.call(stylizerrewrite, referencehtml, stylizercore) : {};

  var divtheme = themestyles.div || {};
  var ptheme = themestyles.p || {};
  var h2theme = themestyles.h2 || {};
  var tdtheme = themestyles.td || {};
  var inputtheme = themestyles.input || {};
  var pretheme = themestyles.pre || {};

  var bg = divtheme.backgroundColor || '#0f172a';
  var text = ptheme.color || '#f8fafc';
  var accent = h2theme.color || '#f59e0b';
  var bordercolor = tdtheme.borderBottomColor || '#334155';
  var fontfamily = ptheme.fontFamily || "'Georgia', serif";
  var fontsize = ptheme.fontSize || '1rem';
  var surface = inputtheme.background || bg || '#1e293b';

  function buildbaserules(tags, index, acc) {
    if (index >= tags.length) return acc;
    var tag = tags[index];

    if (!Object.prototype.hasOwnProperty.call(themestyles, tag)) {
      return buildbaserules(tags, index + 1, acc);
    }

    return buildbaserules(
      tags,
      index + 1,
      acc.concat([{ tag: tag, style: themestyles[tag] }])
    );
  }

  var baserules = buildbaserules(Object.keys(themestyles), 0, []);

  var panestrong = colorharmony.emphasize(accent, bg, 1.2, colorcore);
  var panemuted = colorharmony.pick(
    colorharmony.monochromatic(bg, 3, undefined, colorcore),
    1
  );
  var panekey = colorharmony.complementary(accent, colorharmony, colorcore)[0];

  var cardstrong = colorharmony.emphasize(accent, surface, 1.2, colorcore);
  var cardmuted = colorharmony.pick(
    colorharmony.monochromatic(surface, 3, undefined, colorcore),
    1
  );

  var computefgfn = colorcontrast.computeforeground || colorcontrast.computeForeground;
  var thtext = computefgfn
    ? computefgfn.call(
        colorcontrast,
        '#000000',
        accent,
        undefined,
        colorcontrast,
        colorcore
      )
    : '#000000';

  var ruledefs = [
    { id: 'ingredientspane', style: { background: bg, color: text, fontFamily: fontfamily, fontSize: fontsize } },
    { tag: 'strong', style: { color: panestrong } },
    { class: 'ingredient-card', style: { background: surface, color: cardmuted } },
    {
      path: [
        { axis: 'descendant', class: 'ingredient-card' },
        { axis: 'child', tag: 'strong' }
      ],
      style: { color: cardstrong, fontSize: '1.1em' }
    },
    {
      path: [
        { axis: 'descendant', class: 'ingredient-card' },
        { axis: 'child', tag: 'p' }
      ],
      style: { color: cardmuted }
    },
    {
      tag: 'pre',
      style: {
        background: pretheme.background || '#1e293b',
        color: text
      }
    },
    { tag: 'th', style: { background: accent, color: thtext } }
  ];

  function buildharmonicrules(defs, index, acc) {
    if (index >= defs.length) return acc;
    return buildharmonicrules(defs, index + 1, acc.concat([defs[index]]));
  }

  var harmonicrules = buildharmonicrules(ruledefs, 0, []);

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
  var optimizedhtml = optimizestylefn.call(
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

  return optimizedhtml.html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyingredientstheme: applyingredientstheme
  };
}

