function applyscaffoldtheme(contenthtml, referencehtml, frameworkfunctions, parser) {
  var stylizercore = frameworkfunctions.stylizercore;
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var colorcore = frameworkfunctions.colorcore;
  var colorharmony = frameworkfunctions.colorharmony;
  var colorcontrast = frameworkfunctions.colorcontrast;

  var domparserctor = parser;
  if (!domparserctor || typeof domparserctor !== 'function') {
    throw new Error('[applyscaffoldtheme] DOMParser not available; provide a parser.');
  }

  var extractallfn = stylizerrewrite.extractalltagstyles || stylizerrewrite.extractAllTagStyles;
  var themestyles = extractallfn ? extractallfn.call(stylizerrewrite, referencehtml, stylizercore) : {};

  var doc = new domparserctor().parseFromString(referencehtml, 'text/html');

  var rootstyles = doc.getElementsByTagName('div')[0].style || {};
  var divstyles = doc.getElementsByTagName('div')[0].style || {};

  var bg = divstyles.background || divstyles.backgroundColor || '#0f172a';
  var text = divstyles.color || '#f8fafc';

  var accent = doc.getElementsByTagName('h2')[0] && doc.getElementsByTagName('h2')[0].style
    ? doc.getElementsByTagName('h2')[0].style.color
    : null;
  if (!accent) accent = '#f59e0b';

  var bordercolor = doc.getElementsByTagName('td')[0] && doc.getElementsByTagName('td')[0].style
    ? doc.getElementsByTagName('td')[0].style.borderBottomColor
    : null;
  if (!bordercolor) bordercolor = '#334155';

  var fontfamily = divstyles.fontFamily || rootstyles.fontFamily || "'Georgia', serif";
  var fontsize = divstyles.fontSize || rootstyles.fontSize || '1rem';

  var getpalettefn = colorcontrast.getcontrastingpalette || colorcontrast.getContrastingPalette;
  var levelpalettefn = colorcontrast.contrastinglevel || colorcontrast.contrastingLevel;

  var palette = getpalettefn ? getpalettefn.call(colorcontrast, '' + bg, undefined, {}, colorcore, colorcontrast) : [];
  var inputbg = palette.length && levelpalettefn
    ? levelpalettefn.call(colorcontrast, palette, bg, 65, colorcontrast, colorcore)
    : '#1e293b';

  var palettetext = getpalettefn ? getpalettefn.call(colorcontrast, '' + inputbg, 3.5, {}, colorcore, colorcontrast) : [];
  var inputtext = palettetext.length && levelpalettefn
    ? levelpalettefn.call(colorcontrast, palettetext, '' + inputbg, 65, colorcontrast, colorcore)
    : '#f8fafc';

  var panestrong = colorharmony.emphasize(accent, bg, 1.2, colorcore);
  var panemuted = colorharmony.pick(
    colorharmony.monochromatic(bg, 3, undefined, colorcore),
    1
  );
  var panekey = colorharmony.complementary(accent, colorharmony, colorcore)[0];

  var h2base = levelpalettefn && getpalettefn
    ? levelpalettefn.call(
        colorcontrast,
        getpalettefn.call(colorcontrast, '' + bg, undefined, {}, colorcore, colorcontrast),
        bg,
        75,
        colorcontrast,
        colorcore
      )
    : '#f59e0b';
  var h2color = colorharmony.emphasize(h2base, bg, 1.2, colorcore);

  function getfirststyledelement(tag) {
    var el = doc.getElementsByTagName(tag)[0];
    return el && el.style ? el.style : null;
  }

  var prestyle = getfirststyledelement('pre');
  var buttonstyle = getfirststyledelement('button');

  var ruledefs = [
    { id: 'reciperoot', style: { background: bg, color: text, fontFamily: fontfamily, fontSize: fontsize } },
    { id: 'recipetitle', style: { color: accent, fontWeight: '700' } },
    { id: 'recipesubtitle', style: { color: panemuted } },
    { id: 'recipegobtn', style: { border: 'none', fontWeight: '600', cursor: 'pointer' } },
    {
      id: 'recipeloader',
      style: {
        background: prestyle ? prestyle.background || '#1e293b' : '#1e293b',
        color: text
      }
    },
    { id: 'recipetabs', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    {
      path: [
        { axis: 'child', id: 'recipetabs' },
        { axis: 'child', tag: 'button' }
      ],
      style: {
        background: buttonstyle ? buttonstyle.background || 'transparent' : 'transparent',
        color: panemuted,
        cursor: 'pointer'
      }
    },
    { tag: 'button', style: { backgroundColor: inputbg, color: inputtext } },
    { tag: 'input', style: { backgroundColor: inputbg, color: inputtext } },
    { tag: 'strong', style: { backgroundColor: inputbg, color: inputtext } },
    { tag: 'h2', style: { backgroundColor: bg, color: h2color } },
    {
      tag: 'p',
      style: {
        backgroundColor: bg,
        color: levelpalettefn && getpalettefn
          ? levelpalettefn.call(
              colorcontrast,
              getpalettefn.call(colorcontrast, '' + bg, undefined, {}, colorcore, colorcontrast),
              bg,
              75,
              colorcontrast,
              colorcore
            )
          : text
      }
    }
  ];

  function buildrules(defs, index, acc) {
    if (index >= defs.length) return acc;
    return buildrules(defs, index + 1, acc.concat([defs[index]]));
  }

  var harmonicrules = buildrules(ruledefs, 0, []);

  var modifiedhtml = stylizerrewrite.rewritestyleattrs(
    contenthtml,
    harmonicrules,
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
    applyscaffoldtheme: applyscaffoldtheme
  };
}

