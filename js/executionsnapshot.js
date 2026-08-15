import { enqueueDbStore, enqueueDbRestore } from './actors/dbactor.js';
import { logdebug, loginfo } from './verbosity.js';

const SNAPSHOT_KEY = 'global:executionsnapshot';

const createEmptySnapshot = () => ({
  version: 1,
  savedAt: Date.now(),
  loadedPipelines: {},
  spawnedPipelines: {},
  globalHtml: { targets: {} }
});

let snapshot = createEmptySnapshot();
let saveTimer = null;

const logRestoreStep = (step, detail = '') => {
  loginfo('[RESTORE] ' + step, detail);
};

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    snapshot.savedAt = Date.now();
    enqueueDbStore(SNAPSHOT_KEY, snapshot).catch((err) => {
      console.warn('[EXECUTIONSNAPSHOT] save failed:', err);
    });
  }, 250);
};

export const loadSnapshot = async () => {
  try {
    const stored = await enqueueDbRestore(SNAPSHOT_KEY);
    if (stored && stored.loadedPipelines) {
      snapshot = stored;
      logRestoreStep('global-snapshot-loaded', {
        savedAt: snapshot.savedAt,
        loadedPipelines: Object.keys(snapshot.loadedPipelines || {}),
        spawnedPipelines: Object.keys(snapshot.spawnedPipelines || {})
      });
    } else {
      snapshot = createEmptySnapshot();
      logRestoreStep('global-snapshot-loaded', { empty: true });
    }
  } catch (err) {
    console.warn('[EXECUTIONSNAPSHOT] load failed:', err);
  }
  return snapshot;
};

export const getSnapshot = () => snapshot;

export const eventPipelineLoaded = (pipelineId, env = {}) => {
  if (!snapshot.loadedPipelines[pipelineId]) {
    snapshot.loadedPipelines[pipelineId] = {
      status: 'running',
      stages: {},
      env: env || {}
    };
  } else {
    snapshot.loadedPipelines[pipelineId].status = 'running';
    snapshot.loadedPipelines[pipelineId].env = env || snapshot.loadedPipelines[pipelineId].env || {};
  }
  scheduleSave();
};

export const eventStageState = (pipelineId, stageId, state) => {
  const pipeline = snapshot.loadedPipelines[pipelineId] || { stages: {}, env: {} };
  snapshot.loadedPipelines[pipelineId] = pipeline;
  if (!pipeline.stages[stageId]) pipeline.stages[stageId] = { elements: {} };
  pipeline.stages[stageId] = { ...pipeline.stages[stageId], ...state };
  scheduleSave();
};

export const eventElementState = (pipelineId, stageId, elementId, state) => {
  const pipeline = snapshot.loadedPipelines[pipelineId] || { stages: {}, env: {} };
  snapshot.loadedPipelines[pipelineId] = pipeline;
  if (!pipeline.stages[stageId]) pipeline.stages[stageId] = { elements: {} };
  pipeline.stages[stageId].elements[elementId] = state;
  scheduleSave();
};

export const eventEnvUpdated = (pipelineId, env) => {
  const pipeline = snapshot.loadedPipelines[pipelineId] || { stages: {}, env: {} };
  snapshot.loadedPipelines[pipelineId] = pipeline;
  pipeline.env = env || {};
  scheduleSave();
};

export const eventHtmlUpdated = (targetId, html) => {
  snapshot.globalHtml.targets[targetId] = html;
  scheduleSave();
};

export const eventSpawnLoaded = (parentPipelineId, childPipelineId, containerref) => {
  snapshot.spawnedPipelines[childPipelineId] = {
    parent: parentPipelineId,
    containerref: containerref || null
  };
  if (!snapshot.loadedPipelines[childPipelineId]) {
    snapshot.loadedPipelines[childPipelineId] = {
      status: 'running',
      stages: {},
      env: {}
    };
  }
  scheduleSave();
};

export const applyGlobalHtml = (htmlMap) => {
  if (!htmlMap || !htmlMap.targets) return;
  const targetIds = Object.keys(htmlMap.targets);
  for (const targetId of targetIds) {
    const html = htmlMap.targets[targetId];
    if (typeof html !== 'string') continue;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.innerHTML = html;
    }
  }
};

export const getLoadedPipelines = () => snapshot.loadedPipelines;
export const getSpawnedPipelines = () => snapshot.spawnedPipelines;
export const getGlobalHtml = () => snapshot.globalHtml;
