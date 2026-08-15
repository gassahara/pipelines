import { callwithstack } from "./factory/callwithstack.js";
import { EVALSTACK } from "./evalstack.js";
import { logdebug, loginfo } from "./verbosity.js";
import {
  enqueueExecutionStart,
  enqueueExecutionSaveStatus,
  enqueueExecutionGetStatus
} from "./actors/executionactor.js";

const logRestoreStep = (step, detail = '') => {
  loginfo('[RESTORE] ' + step, detail);
};

const safeOutputs = (env) => {
  const out = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (typeof value === 'function') continue;
    if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) continue;
    if (typeof Node !== 'undefined' && value instanceof Node) continue;
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) continue;
    try {
      const json = JSON.stringify(value);
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

export const createpipeline = (stages, sinks = [], onprogress, options = {}) => {
  if (!Array.isArray(stages)) throw new Error("[PIPELINE] Stages must be an array.");

  const {
    resumeFrom = null,
    pipelineId = 'default_pipeline',
    restoredEnv = null
  } = options;

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
    // Restore env from Execution Actor saved pipeline env if present.
    if (restoredEnv && typeof restoredEnv === 'object') {
      logRestoreStep('restoring-env', { pipelineId, restoredEnv: 'yes' });
      for (const [key, value] of Object.entries(restoredEnv)) {
        if (!(key in env) || env[key] === undefined) {
          env[key] = value;
        }
      }
      logRestoreStep('env-restored', { pipelineId });
    } else {
      logRestoreStep('restoring-env', { pipelineId, restoredEnv: 'no' });
    }

    let resumeIndex = -1;
    if (resumeFrom && resumeFrom.stageId) {
      resumeIndex = stages.findIndex(s => (s.id || s.stagemeta?.stageid) === resumeFrom.stageId);
    }

    logRestoreStep('pipeline-booting', {
      pipelineId,
      resumeFrom: resumeFrom || null,
      resumeIndex
    });

    try {
      for (let idx = fromIndex; idx < stages.length; idx++) {
        const stage = stages[idx];
        const stageid = stage.id || stage.stagemeta?.stageid || ('stage_' + idx);
        const stageMeta = stage.stagemeta || {};

        // Skip stages before the resume point only.
        if (resumeIndex !== -1 && idx < resumeIndex) {
          logdebug('[PIPELINE] Skipping stage before resume point:', stageid);
          continue;
        }

        // Read Execution Actor status for this pipeline once.
        let pipelineStatus = null;
        try {
          pipelineStatus = await enqueueExecutionGetStatus(pipelineId);
        } catch (err) {
          console.warn('[PIPELINE] execution actor get status failed:', err);
        }

        const savedStageStatus = pipelineStatus?.stages?.[stageid]?.status || null;
        if (savedStageStatus === 'cancelled') {
          logdebug('[PIPELINE] Skipping cancelled stage:', stageid);
          continue;
        }
        if (savedStageStatus === 'stopped') {
          logdebug('[PIPELINE] Stage stopped:', stageid);
          continue;
        }

        const callerid = env.agentid + ':' + stageid;
        const reads = stageMeta.reads || [];

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
    } catch (err) {
      logRestoreStep('pipeline-error', { pipelineId, error: err.message });
      throw err;
    }

    logRestoreStep('pipeline-booted', { pipelineId });
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
