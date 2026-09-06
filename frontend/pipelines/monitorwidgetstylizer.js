function monitorwidgetstylizer(html, frameworkfunctions) {
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var stylizerverify = frameworkfunctions.stylizerverify;
  var stylizercore = frameworkfunctions.stylizercore;

  var rewritestyleattrs = stylizerrewrite.rewritestyleattrs;
  var verifycontrast = stylizerverify.verifycontrast || stylizerverify.verifyContrast;

  var styled = rewritestyleattrs(html, [
    {
      id: 'monitorwidget',
      style: {
        fontSize: '12px',
        color: '#cbd5e1'
      }
    }
  ], stylizercore);

  return verifycontrast(styled, 4.5, stylizercore);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    monitorwidgetstylizer: monitorwidgetstylizer
  };
}

