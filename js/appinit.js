import { compilepipeline } from './factory/blockcompiler.js';
import { updateworldmap } from './context.js';

import { installdebugagent } from './debugagent.js';
import { loginfo, getverbosity, setverbosity, getverbosityname, VERBOSITY } from './verbosity.js';
import shelldna from '../oracles/shell.js';

const sinks = [{ fn: updateworldmap, args: [] }];

installdebugagent();


const createstatusbar = () => {
  const statusbar = document.createElement('div');
  statusbar.id = 'verbosity-statusbar';
  statusbar.style.cssText = 'position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.8); color:#fff; padding:5px 10px; border-radius:5px; font-family:monospace; font-size:12px; z-index:9999; cursor:pointer;';
  statusbar.title = 'Click to cycle verbosity level';
  
  const updatedisplay = () => {
    const level = getverbosity();
    const name = getverbosityname(level);
    statusbar.textContent = 'Verbosity: ' + name + ' (' + level + ')';
  };
  
  statusbar.onclick = () => {
    const current = getverbosity();
    const next = (current + 1) % (VERBOSITY.DEBUG + 1);
    setverbosity(next);
    updatedisplay();
    loginfo('[APPINIT] Verbosity changed to:', getverbosityname(next));
  };
  
  updatedisplay();
  document.body.appendChild(statusbar);
};

createstatusbar();

var env = {
  registersubscription: function(sourceId, eventType, handler) {
    var el = document.getElementById(sourceId);
    if (el) el.addEventListener(eventType, handler);
  },
  rngactive: true,
  stack: {},
  updateworldmap: updateworldmap,
  containerid: 'approot'
};
var compiled = await compilepipeline(shelldna.pipeline, null, sinks);
await compiled.pipeline({ id: 'shell', env: env });
loginfo('[APPINIT] SHELL AGENT STARTED');
