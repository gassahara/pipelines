function applyscaffoldlayout(contenthtml, referencehtml, viewportdata, frameworkfunctions, parser) {
  var stylizercore = frameworkfunctions.stylizercore;
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var layoutcore = frameworkfunctions.layoutcore;
  var layoutcorrection = frameworkfunctions.layoutcorrection;

  var domparserctor = parser;
  if (!domparserctor || typeof domparserctor !== 'function') {
    throw new Error('[applyscaffoldlayout] DOMParser not available; provide a parser.');
  }

  var mobile = 600;
  var tablet = 960;

  var mobiledirectives = [
    'position: top',
    'overflow: scroll',
    'respect-margins: true',
    'flex: dir=column, gap=12'
  ];

  var tabletdirectives = [
    'position: center',
    'overflow: ',
    'respect-margins: true',
    'flex: dir=column, gap=16'
  ];

  var desktopdirectives = [
    'position: center',
    'overflow: hidden',
    'z-stack: topmost',
    'respect-margins: true',
    '@mobile: position: top',
    '@tablet: position: center'
  ];

  var refdoc = new domparserctor().parseFromString(referencehtml, 'text/html');

  var divstyles = refdoc.getElementsByTagName('div')[0].style || {};
  var rootstyles = {};

  var accentel = refdoc.getElementsByTagName('h2')[0];
  var accent = accentel && accentel.style ? accentel.style.color : null;
  if (!accent) accent = '#f59e0b';

  var tdel = refdoc.getElementsByTagName('td')[0];
  var bordercolor = tdel ? tdel.style.borderBottomColor : null;
  if (!bordercolor) bordercolor = '#334155';

  var buttonel = refdoc.getElementsByTagName('button')[0];
  var borderradius = buttonel ? buttonel.style.borderRadius : null;
  if (!borderradius) borderradius = '8px';

  var baselayout = {
    maxWidth: divstyles.maxWidth || rootstyles.maxWidth || '960px',
    margin: divstyles.margin || rootstyles.margin || '0 ',
    padding: divstyles.padding || rootstyles.padding || '16px'
  };

  var directives;
  if (!viewportdata || viewportdata.viewportwidth < mobile) {
    directives = mobiledirectives;
  } else if (viewportdata.viewportwidth < tablet) {
    directives = tabletdirectives;
  } else {
    directives = desktopdirectives;
  }

  var parsedirectivesfn = layoutcore.parsedirectives || layoutcore.parseDirectives;
  var parsed = parsedirectivesfn.call(layoutcore, directives.join(';'));
  var bpmap = { mobile: mobile, tablet: tablet };

  var generatecssfn = layoutcore.generatecssfromdirectives || layoutcore.generateCSSFromDirectives;
  var cssresult = generatecssfn.call(
    layoutcore,
    'reciperoot',
    parsed,
    bpmap,
    layoutcore
  );

  var directivestyles = cssresult.inline;

  function mergestyles(a, b) {
    var out = {};
    Object.keys(a || {}).forEach(function(k) { out[k] = a[k]; });
    Object.keys(b || {}).forEach(function(k) { out[k] = b[k]; });
    return out;
  }

  var combinedstyles = mergestyles(baselayout, directivestyles);

  var html = stylizerrewrite.rewritestyleattrs(
    contenthtml,
    [{ id: 'reciperoot', style: combinedstyles }],
    stylizercore
  );

  var vpwidth = viewportdata ? viewportdata.viewportwidth : 1024;
  var spacing = stylizercore.computeBaseSpacing(vpwidth);

  var layoutrules = [
    {
      id: 'reciperoot',
      style: {
        border: '1px solid ' + bordercolor,
        borderRadius: borderradius,
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
      }
    },
    {
      id: 'recipeinput',
      style: {
        border: '1px solid ' + bordercolor,
        borderRadius: borderradius,
        padding: spacing.btnPadV + 'px ' + spacing.btnPadH + 'px'
      }
    },
    {
      id: 'recipegobtn',
      style: {
        border: 'none',
        borderRadius: borderradius,
        padding: spacing.btnPadV + 'px ' + spacing.btnPadH + 'px',
        cursor: 'pointer'
      }
    },
    {
      id: 'recipeloader',
      style: {
        padding: spacing.cardPad + 'px ' + spacing.btnPadH + 'px',
        borderRadius: borderradius
      }
    },
    {
      path: [
        { axis: 'child', id: 'recipetabs' },
        { axis: 'child', tag: 'button' }
      ],
      style: {
        border: '1px solid ' + bordercolor,
        borderRadius: borderradius,
        padding: spacing.btnPadV + 'px ' + spacing.btnPadH + 'px',
        cursor: 'pointer'
      }
    }
  ];

  html = stylizerrewrite.rewritestyleattrs(html, layoutrules, stylizercore);

  var imgdoc = new domparserctor().parseFromString(html, 'text/html');
  var imgs = Array.prototype.slice.call(imgdoc.getElementsByTagName('img'));

  function buildimgrules(index, acc) {
    if (index >= imgs.length) return acc;
    return buildimgrules(
      index + 1,
      acc.concat([{ tag: 'img', style: { maxWidth: '100%', height: '' } }])
    );
  }

  var imgrules = buildimgrules(0, []);

  if (imgrules.length) {
    html = stylizerrewrite.rewritestyleattrs(html, imgrules, stylizercore);
  }

  var containerwidths = {
    reciperoot: parseFloat(combinedstyles.maxWidth) || vpwidth
  };

  var goals = [
    { type: 'overflow' },
    { type: 'minVerticalGap', options: { minGap: 12 } },
    { type: 'preventOverlap' },
    { type: 'scrollability' },
    { type: 'controlledOverlay' }
  ];

  var optimizelayoutfn = layoutcorrection.optimizelayouthtml || layoutcorrection.optimizeLayoutHTML;
  var optimized = optimizelayoutfn.call(
    layoutcorrection,
    html,
    goals,
    5,
    { viewportWidth: vpwidth, containerWidths: containerwidths },
    stylizercore,
    layoutcore,
    layoutcorrection
  );

  return optimized.html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyscaffoldlayout: applyscaffoldlayout
  };
}

