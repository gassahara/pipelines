// shellhelpers.js
// Shell-specific helper functions for frontend shell pipeline.
// ES5, functional recursive, no regex, lowercase identifiers.

function buildshelldom(data) {
  var tabhtml = data.tabs
    .map(function(tab) {
      return '<div id="workspace' + tab.id + '" style="flex:1;overflow:auto;padding:24px;display:none"></div>';
    })
    .join('');

  return '<div id="shellroot" style="display:flex;height:600px;overflow:hidden">'
    + '<div id="shellsidebar" style="width:260px;display:flex;flex-direction:column;background:#0d0d1a;border-right:1px solid #e6b422;flex-shrink:0;overflow:hidden;position:relative;transition:width 0.3s ease">'
    + '<div id="sidebarheader" style="padding:20px 16px 12px;text-align:center;border-bottom:1px solid #2d3748;flex-shrink:0;overflow:hidden;white-space:nowrap">'
    + '<h1 style="font-family:\'Playfair Display\',Georgia,serif;font-size:1.2rem;color:#f59e0b;margin:0;letter-spacing:0.5px">Culinary Kitchen</h1>'
    + '<p style="font-size:0.7rem;color:#94a3b8;margin:4px 0 0;text-transform:uppercase;letter-spacing:1.5px">Recipe & Dish Oracle</p>'
    + '<div style="margin-top:10px;">'
    + '<label for="themeselect" style="display:none">Select theme</label>'
    + '<select id="themeselect" aria-label="Select theme" style="background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:4px;padding:4px 8px;font-size:12px;width:100%;">'
    + '<option value="dark" selected>Dark Kitchen</option>'
    + '<option value="light">Light Bakery</option>'
    + '</select>'
    + '</div>'
    + '</div>'
    + '<div id="sidebarnav" style="flex:1;overflow-y:auto;padding:12px 8px;overflow-x:hidden" role="navigation" aria-label="Oracle selection"></div>'
    + '<div id="sidebarstatus" style="padding:12px 16px;border-top:1px solid #2d3748;display:flex;align-items:center;gap:8px;font-size:0.75rem;color:#718096;flex-shrink:0;overflow:hidden"></div>'
    + '<button id="sidebartoggle" aria-label="Toggle sidebar" style="position:absolute;bottom:12px;right:-13px;width:26px;height:26px;border-radius:50%;background:#0d0d1a;border:1px solid #e6b422;color:#e6b422;cursor:pointer;font-size:11px;line-height:1;z-index:10;display:flex;align-items:center;justify-content:center;padding:0" title="Toggle sidebar">\u25C0</button>'
    + '</div>'
    + '<div id="shellworkspace" style="flex:1;display:flex;overflow:hidden">'
    + '<div id="homeroot" style="flex:1;overflow:auto;padding:24px;display:block"></div>'
    + tabhtml
    + '</div></div>';
}

function writefullshell(properties) {
  var frameworkfunctions = properties.inputs.frameworkfunctions;
  var themefunctions = properties.inputs.themefunctions;
  var shellfunctions = properties.inputs.shellfunctions;
  var data = properties.inputs.shelldata;
  var theme = properties.inputs.selectedtheme;
  var viewport = properties.inputs.currentviewport;
  var parser = frameworkfunctions.domparser;

  var themerefhtml = themefunctions.generatethemereference(theme || 'dark');
  var html = buildshelldom(data);

  if (themerefhtml) {
    html = shellfunctions.applyshelltheme(html, themerefhtml, parser);
    html = shellfunctions.applyshelllayout(html, themerefhtml, viewport, parser);
  }

  return { id: 'shellroot', timeout: 5000, html: html };
}

function buildhomemenu(agents, prefix) {
  if (prefix === undefined) prefix = '';
  return '<div id="homemenu" style="display:flex;flex-direction:column;gap:6px;padding:4px 0" role="navigation" aria-label="Oracle selection">'
    + agents
      .map(function(agent) {
        return '<button id="' + prefix + 'tabyj' + '" aria-label="' + agent.name + '" style="display:flex;align-items:center;gap:10px;width:100%;background:#1a1a2e;color:#e6b422;border:1px solid #e6b422;border-radius:6px;padding:10px 14px;cursor:pointer;font-family:serif;font-size:13px;text-align:left;box-sizing:border-box" data-oracle="' + agent.id + '">'
          + '<span style="font-size:1.1rem;width:20px;text-align:center"></span><span>' + agent.name + '</span></button>';
      })
      .join('')
    + '</div>';
}

function writehomemenu(properties) {
  var data = properties.inputs.shelldata;
  var html = buildhomemenu(data.tabs, '');
  return { id: 'homemenu', timeout: 5000, html: html };
}

function buildhomecontent(agents) {
  return agents.map(function(agent) {
    return '<div class="agent-card" id="homecard' + agent.id + '" style="background:#1a1a2e;border:1px solid #e6b422;border-radius:12px;padding:20px;margin-bottom:12px;cursor:pointer" data-oracle="' + agent.id + '">'
      + '<h2 style="font-size:1.2rem;color:#f59e0b;margin:0 0 8px">' + agent.name + '</h2>'
      + '<button id="hometabyj" style="background:#e6b422;color:#0d0d1a;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-family:serif;font-size:13px">Open ' + agent.name + '</button>'
      + '</div>';
  }).join('');
}

function writehomecontent(properties) {
  var data = properties.inputs.shelldata;
  var html = buildhomecontent(data.tabs);
  return { id: 'homeroot', timeout: 5000, html: html };
}

function pad2(n) {
  var s = String(n || 0);
  return s.length < 2 ? '0' + s : s;
}

function buildmonitorwidget(widgetstate) {
  var colors = { yellow: '#ffcc00', red: '#ff3333', green: '#33cc33' };
  var bordercolors = { yellow: '#ff9900', red: '#cc0000', green: '#229922' };
  var bg = colors[widgetstate.color] || '#33cc33';
  var bc = bordercolors[widgetstate.color] || '#229922';
  var mo = widgetstate.minuteofday;
  var wins = [60, 360];
  var nextwin = null;
  var prevwin = null;
  var inalert = false;

  wins.forEach(function(win) {
    var d = win - mo;
    if (d >= -15 && d < 15) inalert = true;
    if (d > 0 && (nextwin === null || d < nextwin)) nextwin = d;
    if (d <= 0 && (prevwin === null || d > prevwin)) prevwin = d;
  });

  if (prevwin === null && wins.length > 0) prevwin = (1440 - mo) + wins[0];

  var alertstr = '';
  if (inalert) {
    alertstr = '\u26A0 ends ' + formatminutes(Math.abs(prevwin)) + '';
  } else if (nextwin !== null) {
    alertstr = '\u2192 ' + formatminutes(nextwin) + '';
  }

  var utcstr = pad2(widgetstate.utchour) + ':' + pad2(widgetstate.utcmin);

  return '<div id="monitorwidget" style="display:flex;align-items:center;gap:8px;font-size:11px;color:#a0aec0;width:100%">'
    + '<span id="monitorwidgetdot" style="background:' + bg + ';border:2px solid ' + bc + ';border-radius:50%;width:10px;height:10px;display:inline-block;flex-shrink:0"></span>'
    + '<span style="font-family:monospace;font-size:11px;color:' + (widgetstate.color === 'red' ? '#ff3333' : '#a0aec0') + '">' + utcstr + '</span>'
    + (alertstr ? ' <span style="font-size:10px;color:' + (widgetstate.color === 'red' ? '#ff3333' : '#718096') + '">' + alertstr + '</span>' : '')
    + '</div>';
}

function formatminutes(m) {
  var absm = Math.abs(m);
  var h = Math.floor(absm / 60);
  var min = absm % 60;
  return (h > 0 ? h + 'h ' : '') + min + 'm';
}

function writemonitorwidget(properties) {
  var widgetstate = properties.inputs.widgetstate;
  var html = buildmonitorwidget(widgetstate);
  return { id: 'monitorwidget', timeout: 5000, html: html };
}

function computeinitialwidgetstate(utcnow) {
  var minuteofday = utcnow.hour * 60 + utcnow.minute;
  var wins = [60, 360];
  var color = 'green';
  var playsound = false;
  var prevsoundstate = false;

  wins.forEach(function(win) {
    var delta = win - minuteofday;
    if (delta >= -15 && delta < 15) {
      color = 'red';
      if (!prevsoundstate) playsound = true;
      prevsoundstate = true;
    } else if (delta >= 15 && delta < 60) {
      if (color !== 'red') color = 'yellow';
    }
  });

  return {
    color: color,
    playsound: playsound,
    minuteofday: minuteofday,
    utchour: utcnow.hour,
    utcmin: utcnow.minute
  };
}

function computeupdatedwidgetstate(utcnow) {
  var minuteofday = utcnow.hour * 60 + utcnow.minute;
  var wins = [60, 360];
  var color = 'green';
  wins.forEach(function(win) {
    var delta = win - minuteofday;
    if (delta >= -15 && delta < 15) color = 'red';
    else if (delta >= 15 && delta < 60 && color !== 'red') color = 'yellow';
  });
  return { color: color, minuteofday: minuteofday };
}

function computewidgetstyle(widgetstate) {
  var colors = { yellow: '#ffcc00', red: '#ff3333', green: '#33cc33' };
  var bordercolors = { yellow: '#ff9900', red: '#cc0000', green: '#229922' };
  return {
    background: colors[widgetstate.color] || '#33cc33',
    borderColor: bordercolors[widgetstate.color] || '#229922'
  };
}

function computeshellstyles(theme) {
  var themes = {
    dark: { bg: '#121824', text: '#f8fafc', accent: '#f59e0b', sidebarbg: '#0f172a', border: '#334155', togglebg: '#d97706' },
    light: { bg: '#fdf6e3', text: '#1e293b', accent: '#b45309', sidebarbg: '#fef3c7', border: '#d4a373', togglebg: '#f59e0b' }
  };
  var t = themes[theme] || themes.dark;
  return {
    shellrootstyle: { background: t.bg, color: t.text },
    shellsidebarstyle: { background: t.sidebarbg, color: t.text, borderRightColor: t.border },
    sidebarheaderstyle: { background: t.bg, color: t.text, borderBottomColor: t.border },
    sidebarnavstyle: { background: t.bg, color: t.text },
    sidebarstatusstyle: { background: t.sidebarbg, color: t.text, borderTopColor: t.border },
    sidebartogglestyle: { background: t.togglebg, borderColor: t.accent, color: t.text },
    shellworkspacestyle: { background: t.bg, color: t.text }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildshelldom: buildshelldom,
    writefullshell: writefullshell,
    buildhomemenu: buildhomemenu,
    writehomemenu: writehomemenu,
    buildhomecontent: buildhomecontent,
    writehomecontent: writehomecontent,
    pad2: pad2,
    buildmonitorwidget: buildmonitorwidget,
    formatminutes: formatminutes,
    writemonitorwidget: writemonitorwidget,
    computeinitialwidgetstate: computeinitialwidgetstate,
    computeupdatedwidgetstate: computeupdatedwidgetstate,
    computewidgetstyle: computewidgetstyle,
    computeshellstyles: computeshellstyles
  };
}

