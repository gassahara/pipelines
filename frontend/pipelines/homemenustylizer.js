function homemenustylizer(html, frameworkfunctions) {
  var stylizerrewrite = frameworkfunctions.stylizerrewrite;
  var stylizercore = frameworkfunctions.stylizercore;
  var rewritestyleattrs = stylizerrewrite.rewritestyleattrs;

  return rewritestyleattrs(html, [
    {
      id: 'homemenu',
      style: {
        background: '#000000e0'
      }
    }
  ], stylizercore);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    homemenustylizer: homemenustylizer
  };
}

