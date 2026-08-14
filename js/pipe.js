import { callwithstack } from "./factory/callwithstack.js";
import { EVALSTACK } from "./evalstack.js";
import { logdebug } from "./verbosity.js";
import { enqueueExecutionStart, enqueueExecutionSaveStatus } from "./actors/executionactor.js";
import { enqueueDbStore, enqueueDbRestore } from "./actors/dbactor.js";
import { revalidateAll } from "./actors/trigerregistry.js";

const SNAPSHOT_KEYS = [
  'agentid',
  'approot',
  'currenttheme',
  'themetokens',
  'cssprefix',
  'authsessionaccesstoken',
  'data',
  'layout'
];

const safeOutputs = (env) => {
  const out = {};
  for (const key of SNAPSHOT_KEYS) {
    if (env[key] === undefined) continue;
    if (typeof env[key] === 'function') continue;
    if (typeof HTMLElement !== 'undefined' && env[key] instanceof HTMLElement) continue;
    if (typeof Node !== 'undefined' && env[key] instanceof Node) continue;
    if (typeof EventTarget !== 'undefined' && env[key] instanceof EventTarget) continue;
    try {
      const json = JSON.stringify(env[key]);
      if (json.length > 64 * 1024) {
        out[key] = '[large-value omitted]';
      } else {
        out[key] = JSON.parse(json);
      }
    } catch {
      out[key] = null;
    }
  }
  return out;
};

const applyHtmlMap = (htmlMap) => {
  if (!htmlMap || !htmlMap.targets) return;
  for (const [targetId, html] of Object.entries(htmlMap.targets)) {
    if (typeof html !== 'string') continue;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.innerHTML = html;
    }
  }
};

export const createpipeline = (stages, sinks = [], onprogress, options = {}) => {
  if (!Array.isArray(stages)) throw new Error("[PIPELINE] Stages must be an array.");

  const {
    resumeFrom = null,
    pipelineId = 'default_pipeline',
    restoredEnv = null,
    restoredHtmlMap = null
  } = options;

  // Local runtime promise stack for async stages.
  // Shared EXECUTIONACTOR is used for status observability and control.
  const stageStack = [];

  const awaitPendingForReads = async (reads) => {
    const pending = stageStack.filter(entry =>
      entry.writes.some(k => reads.includes(k))
    );
    if (pending.length) {
      await Promise.all(pending.map(p => p.promise));
      for (const p of pending) {
        const idx = stageStack.indexOf(p);
        if (idx !== -1) stageStack.splice(idx, 1);
      }
    }
  };

  const runStage = async (stage, env, callerid, stageid) => {
    const meta = stage.stagemeta || {};
    const isAsync = meta.async === true;
    const fullStageId = env.agentid + ':' + stageid;

    const reads = meta.reads || [];
    const writes = meta.writes || [];

    const startExecution = async () => {
      try {
        await enqueueExecutionStart(fullStageId, {
          ...safeOutputs(env),
          reads,
          writes,
          async: isAsync
        });
      } catch (err) {
        console.warn('[PIPELINE] execution actor start failed:', err);
      }
    };

    const finishExecution = async (status, outputs) => {
      try {
        await enqueueExecutionSaveStatus(fullStageId, status, outputs || safeOutputs(env));
      } catch (err) {
        console.warn('[PIPELINE] execution actor save-status failed:', err);
      }
    };

    await startExecution();

    if (!isAsync) {
      try {
        await callwithstack(
          EVALSTACK,
          'stage-' + stageid + ':' + (stage.intent || "unnamed"),
          "asyncawait",
          async () => {
            const patch = await stage(env);
            if (patch && typeof patch === "object") {
              const updateworldmap = env.updateworldmap;
              if (updateworldmap) updateworldmap(patch);
            }
            return env;
          },
          [],
          {
            context: { env, pipestate: env.pipestate, callerid },
            errk: (err) => {
              err.diagnostic = err.diagnostic || {};
              err.diagnostic.pipelinestage = stageid;
              throw err;
            }
          }
        );
        await finishExecution('completed');
      } catch (err) {
        await finishExecution('failed', { error: err.message });
        throw err;
      }
      return;
    }

    const promise = callwithstack(
      EVALSTACK,
      'stage-async-' + stageid + ':' + (stage.intent || "unnamed"),
      "asyncawait",
      async () => {
        const patch = await stage(env);
        if (patch && typeof patch === "object") {
          const updateworldmap = env.updateworldmap;
          if (updateworldmap) updateworldmap(patch);
        }
        return env;
      },
      [],
      {
        context: { env, pipestate: env.pipestate, callerid },
        errk: (err) => {
          err.diagnostic = err.diagnostic || {};
          err.diagnostic.pipelinestage = stageid;
          throw err;
        }
      }
    )
      .then(async (patch) => {
        await finishExecution('completed');
        return patch;
      })
      .catch(async (err) => {
        await finishExecution('failed', { error: err.message });
        throw err;
      });

    stageStack.push({ promise, reads, writes, stageid });
  };

  const runAll = async (env, fromIndex = 0) => {
    const snapshotKey = 'pipeline:' + env.agentid + ':env';
    const htmlMapKey = `pipeline:${pipelineId}:htmlmap`;

    // Restore prior env snapshot if available.
    try {
      const restored = await enqueueDbRestore(snapshotKey);
      if (restored && typeof restored === 'object') {
        for (const [key, value] of Object.entries(restored)) {
          if (!(key in env) || env[key] === undefined) {
            env[key] = value;
          }
        }
      }
    } catch (err) {
      console.warn('[PIPELINE] snapshot restore failed:', err);
    }

    // Restore full env checkpoint from resumed element, if present.
    if (restoredEnv && typeof restoredEnv === 'object') {
      for (const [key, value] of Object.entries(restoredEnv)) {
        if (!(key in env) || env[key] === undefined) {
          env[key] = value;
        }
      }
    }

    // Restore HTML state from the resumed element checkpoint, if present.
    if (restoredHtmlMap && typeof restoredHtmlMap === 'object') {
      try {
        applyHtmlMap(restoredHtmlMap);
      } catch (err) {
        console.warn('[PIPELINE] restored html map apply failed:', err);
      }
    } else {
      // Fall back to the latest stored html map for this pipeline.
      try {
        const htmlMap = await enqueueDbRestore(htmlMapKey);
        if (htmlMap && htmlMap.targets) {
          applyHtmlMap(htmlMap);
        }
      } catch (err) {
        console.warn('[PIPELINE] html map restore failed:', err);
      }
    }

    // Reattach registered triggers after HTML restoration.
    try {
      revalidateAll();
    } catch (err) {
      console.warn('[PIPELINE] trigger revalidate after html restore failed:', err);
    }

    let lastSnapshot = null;
    const snapshotInterval = setInterval(async () => {
      try {
        const current = safeOutputs(env);
        const currentJson = JSON.stringify(current);
        if (currentJson !== lastSnapshot) {
          lastSnapshot = currentJson;
          await enqueueDbStore(snapshotKey, current);
        }
      } catch (err) {
        console.warn('[PIPELINE] periodic snapshot failed:', err);
      }
    }, 5000);

    try {
      for (let idx = fromIndex; idx < stages.length; idx++) {
        const stage = stages[idx];
        const stageid = stage.id || stage.stagemeta?.stageid || ('stage_' + idx);
        const stageMeta = stage.stagemeta || {};

        // If a resume point is supplied, skip stages before it.
        if (resumeFrom && resumeFrom.stageId) {
          if (stageid !== resumeFrom.stageId) {
            logdebug('[PIPELINE] Skipping stage:', stageid, 'before resume point');
            continue;
          }
        }

        const callerid = env.agentid + ':' + stageid;
        const reads = stageMeta.reads || [];

        // If this stage reads keys written by a pending async stage, await those first.
        await awaitPendingForReads(reads);

        if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP') {
          if (stage.control.fn) {
            const shouldexecute = await stage.control.fn(env);
            if (!shouldexecute) {
              logdebug('[PIPELINE] Skipping stage:', stageid, 'control condition false');
              continue;
            }
          }
        }

        logdebug('[PIPELINE] Executing stage:', stageid, 'for agent:', env.agentid);
        await runStage(stage, env, callerid, stageid);
      }

      if (stageStack.length) {
        await Promise.all(stageStack.map(p => p.promise));
        stageStack.length = 0;
      }
    } finally {
      clearInterval(snapshotInterval);
      try {
        await enqueueDbStore(snapshotKey, safeOutputs(env));
      } catch (err) {
        console.warn('[PIPELINE] final snapshot failed:', err);
      }
    }
  };

  return async (agent) => {
    const env = agent.env;
    if (!env || typeof env !== 'object') {
      throw new Error('[PIPELINE] agent.env is required');
    }

    env.agentid = agent.id;
    env._rerunStages = (fromIndex) => runAll(env, fromIndex);

    await runAll(env);
    return env;
  };
};
