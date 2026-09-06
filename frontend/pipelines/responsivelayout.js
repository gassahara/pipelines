function generateresponsivelayout(containerid, rulesperbreakpoint, frameworkfunctions) {
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var stylizercore = frameworkfunctions.stylizercore;
  var injectresponsivestyles = stylizerrewrite.injectresponsivestyles || stylizerrewrite.injectResponsiveStyles;

  var breakpoints = {
    mobileportrait: 480,
    mobilelandscape: 767,
    tablet: 1023,
    smalldesktop: 1439,
    largedesktop: Infinity
  };

  function buildbreakpointrules(breakpointkeys, index, acc) {
    if (index >= breakpointkeys.length) return acc;

    var key = breakpointkeys[index];
    var rules = rulesperbreakpoint[key] || [];
    var ruleobject = {
      rules: rules
    };

    if (key === 'largedesktop') {
      ruleobject.minWidth = breakpoints.smalldesktop + 1;
    } else if (key === 'mobileportrait') {
      ruleobject.maxWidth = breakpoints.mobileportrait;
    } else if (key === 'mobilelandscape') {
      ruleobject.minWidth = breakpoints.mobileportrait + 1;
      ruleobject.maxWidth = breakpoints.mobilelandscape;
    } else if (key === 'tablet') {
      ruleobject.minWidth = breakpoints.mobilelandscape + 1;
      ruleobject.maxWidth = breakpoints.tablet;
    } else if (key === 'smalldesktop') {
      ruleobject.minWidth = breakpoints.tablet + 1;
      ruleobject.maxWidth = breakpoints.smalldesktop;
    }

    return buildbreakpointrules(breakpointkeys, index + 1, acc.concat([ruleobject]));
  }

  var breakpointrules = buildbreakpointrules(
    ['mobileportrait', 'mobilelandscape', 'tablet', 'smalldesktop', 'largedesktop'],
    0,
    []
  );

  return function(html) {
    if (!html) return html;
    return injectresponsivestyles(html, breakpointrules, stylizercore);
  };
}

function applyresponsivestyles(html, breakpointrules, frameworkfunctions) {
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var stylizercore = frameworkfunctions.stylizercore;
  var injectresponsivestyles = stylizerrewrite.injectresponsivestyles || stylizerrewrite.injectResponsiveStyles;

  return injectresponsivestyles(html, breakpointrules, stylizercore);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateresponsivelayout: generateresponsivelayout,
    applyresponsivestyles: applyresponsivestyles
  };
}

