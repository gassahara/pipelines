import { compilepipeline, bootGlobalSnapshot } from 'https://gassahara.github.io/pipelines/js/factory/blockcompiler.js';
import { updateworldmap } from 'https://gassahara.github.io/pipelines/js/context.js';
import { installdebugagent } from 'https://gassahara.github.io/pipelines/js/debugagent.js';
import { loginfo, getverbosity, setverbosity, getverbosityname, VERBOSITY } from 'https://gassahara.github.io/pipelines/js/verbosity.js';
import { revalidateAll } from 'https://gassahara.github.io/pipelines/js/actors/trigerregistry.js';
import shelldna from './pipelines/shell.js';

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

const shellPipelineId = shelldna?.identity?.id || 'shell';

const baseEnv = {
  registersubscription: function(sourceId, eventType, handler) {
    const el = document.getElementById(sourceId);
    if (el) el.addEventListener(eventType, handler);
  },
  rngactive: true,
  stack: {},
  updateworldmap: updateworldmap,
  containerid: 'approot',
  pipelineid: shellPipelineId
};

loginfo('[APPINIT] Attempting Global Snapshot recovery...');

let bootResult = { recovered: false, pipelineCount: 0 };
try {
  bootResult = await bootGlobalSnapshot();
} catch (err) {
  console.warn('[APPINIT] bootGlobalSnapshot failed, falling back to fresh boot:', err);
}

if (bootResult.recovered && bootResult.pipelineCount > 0) {
  loginfo('[APPINIT] GLOBAL RECOVERY SUCCESSFUL. Resumed pipelines:', bootResult.pipelineCount);
} else {
  loginfo('[APPINIT] Fresh boot: compiling shell pipeline', { pipelineId: shellPipelineId });
  try {
    const compiled = await compilepipeline(shelldna.pipeline, null, sinks, shellPipelineId);
    await compiled.pipeline({ id: shellPipelineId, env: { ...baseEnv } });
    loginfo('[APPINIT] SHELL AGENT STARTED');
  } catch (err) {
    console.error('[APPINIT] Shell pipeline execution failed:', err);
    throw err;
  }
}

// Revalidate and attach all trigger listeners after DOM and pipelines are ready
loginfo('[APPINIT] Revalidating triggers');
revalidateAll();
loginfo('[APPINIT] Trigger revalidation complete');
