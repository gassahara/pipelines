function applydescriptiontheme(contenthtml, referencehtml, frameworkfunctions, parser) {
  var stylizercore = frameworkfunctions.stylizercore;
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var colorcore = frameworkfunctions.colorcore;
  var colorharmony = frameworkfunctions.colorharmony;
  var colorcontrast = frameworkfunctions.colorcontrast;

  var domparserctor = parser;
  if (!domparserctor || typeof domparserctor !== 'function') {
    throw new Error('[applydescriptiontheme] DOMParser not available; provide a parser.');
  }

  var doc = new domparserctor().parseFromString(referencehtml, 'text/html');

  var divstyles = doc.getElementsByTagName('div')[0].style || {};
  var rootstyles = {};

  var bg = divstyles.background || divstyles.backgroundColor || '#0f172a';
  var text = divstyles.color || '#f8fafc';

  var accent = '#f59e0b';
  if (doc.getElementsByTagName('h2')[0] && doc.getElementsByTagName('h2')[0].style) {
    accent = doc.getElementsByTagName('h2')[0].style.color || accent;
  }

  var bordercolor = '#334155';
  if (doc.getElementsByTagName('td')[0] && doc.getElementsByTagName('td')[0].style) {
    bordercolor = doc.getElementsByTagName('td')[0].style.borderBottomColor || bordercolor;
  }

  var fontfamily = divstyles.fontFamily || rootstyles.fontFamily || "'Georgia', serif";
  var fontsize = divstyles.fontSize || rootstyles.fontSize || '1rem';

  var getpalettefn = colorcontrast.getcontrastingpalette || colorcontrast.getContrastingPalette;
  var levelpalettefn = colorcontrast.contrastinglevel || colorcontrast.contrastingLevel;

  var palette = getpalettefn ? getpalettefn.call(colorcontrast, '' + bg, undefined, {}, colorcore, colorcontrast) : [];
  var inputbg = palette.length && levelpalettefn
    ? levelpalettefn.call(colorcontrast, palette, bg, 55, colorcontrast, colorcore)
    : '#1e293b';
  var inputtext = palette.length && levelpalettefn
    ? levelpalettefn.call(colorcontrast, palette, inputbg, 65, colorcontrast, colorcore)
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

  var textcolor = levelpalettefn && getpalettefn
    ? levelpalettefn.call(
        colorcontrast,
        getpalettefn.call(colorcontrast, '' + bg, undefined, {}, colorcore, colorcontrast),
        bg,
        75,
        colorcontrast,
        colorcore
      )
    : text;

  var thpalette = getpalettefn ? getpalettefn.call(colorcontrast, '#000000', undefined, {}, colorcore, colorcontrast) : [];
  var thtext = thpalette.length ? thpalette[0] : '#ffffff';

  function getprestyle() {
    var el = doc.getElementsByTagName('pre')[0];
    return el && el.style ? el.style : null;
  }

  var prestyle = getprestyle();

  var ruledefs = [
    { id: 'descriptionpane', style: { backgroundColor: bg, color: text, fontFamily: fontfamily, fontSize: fontsize } },
    { tag: 'h3', style: { color: panestrong } },
    { tag: 'strong', style: { color: panestrong } },
    { class: 'key', style: { color: panekey, fontWeight: '600' } },
    { tag: 'li', style: { backgroundColor: bg, color: textcolor } },
    {
      tag: 'pre',
      style: {
        background: prestyle ? prestyle.background || '#1e293b' : '#1e293b',
        color: text
      }
    },
    { tag: 'th', style: { background: accent, color: thtext } },
    { tag: 'td', style: { borderBottom: '1px solid ' + bordercolor } },
    { tag: 'button', style: { backgroundColor: inputbg, color: inputtext } },
    { tag: 'input', style: { backgroundColor: inputbg, color: inputtext } },
    { tag: 'h2', style: { backgroundColor: bg, color: h2color } },
    { tag: 'p', style: { backgroundColor: bg, color: textcolor } }
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
  var optimizedhtml = optimizestylefn.call(
    stylizerrewrite,
    modifiedhtml,
    [
      { type: 'contrast', options: { minRatio: 5.5 } },
      { type: 'harmony' },
      { type: 'textVisibility', options: { minFontSize: 12, minLineHeight: 1.2 } },
      { type: 'buttonVisibility' }
    ],
    harmonicrules,
    5,
    stylizercore
  );

  return optimizedhtml.html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applydescriptiontheme: applydescriptiontheme
  };
}

