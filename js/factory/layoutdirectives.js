export function parseDirectives(str) {
  if(!str) return [];
  return str.split(';').map(s=>s.trim()).filter(Boolean).map(part=>{
    const [type, rest] = part.split(':');
    if(!rest) return {type};
    const params = rest.split(',').map(p=>p.trim());
    const directive = {type: type.trim()};
    if(type==='left-of'||type==='right-of'||type==='above'||type==='below'){
      directive.target = params[0];
      if(params[1]) directive.offset = parseFloat(params[1]);
      if(params[2]) directive.unit = params[2];
    } else if(type==='between'){
      const targets = params[0].split('and').map(s=>s.trim());
      directive.target1 = targets[0];
      directive.target2 = targets[1];
      if(params[1]) directive.offset = parseFloat(params[1]);
      if(params[2]) directive.unit = params[2];
    } else if(type==='align'||type==='justify'||type==='immerse'){
      directive.value = params[0];
      if(params[1]) directive.container = params[1];
    }
    return directive;
  });
}

export function generateCSSFromDirectives(elementId, directives) {
  let css = '';
  directives.forEach(d=>{
    switch(d.type){
      case 'left-of':
        css += `#${elementId} { order: -1; margin-right: ${d.offset||0}${d.unit||'px'}; }\n`;
        break;
      case 'right-of':
        css += `#${elementId} { order: 1; margin-left: ${d.offset||0}${d.unit||'px'}; }\n`;
        break;
      case 'above':
        css += `#${elementId} { margin-bottom: ${d.offset||0}${d.unit||'px'}; }\n`;
        break;
      case 'below':
        css += `#${elementId} { margin-top: ${d.offset||0}${d.unit||'px'}; }\n`;
        break;
      case 'between':
        css += `#${elementId} { order: 0; }\n`;
        css += `#${d.target1} { order: -1; }\n`;
        css += `#${d.target2} { order: 1; }\n`;
        break;
      case 'align':
        css += `#${elementId} { display:flex; justify-content:${d.value}; }\n`;
        break;
      case 'justify':
        css += `#${elementId} { text-align:${d.value.replace('text-','')}; }\n`;
        break;
      case 'immerse':
        css += `#${elementId} { display:flex; align-items:center; justify-content:center; }\n`;
        css += `#${elementId} > * { width:fit-content; margin:auto; }\n`;
        break;
    }
  });
  return css;
}
