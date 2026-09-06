function createscaffoldwriter(styledhtmlvar) {
  return function(properties) {
    var html = properties[styledhtmlvar] || '';
    return { id: 'workspaceyj', timeout: 5000, html: html };
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createscaffoldwriter: createscaffoldwriter
  };
}

