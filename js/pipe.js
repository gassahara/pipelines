import { callwithstack } from "./factory/callwithstack.js";
import { EVALSTACK } from "./evalstack.js";
import { validatestageflow } from "./typesystem.js";
import { logdebug } from "./verbosity.js";

export const createpipeline = (stages, sinks = [], onprogress) => {
  if (!Array.isArray(stages)) throw new Error("[PIPELINE] Stages must be an array.");
  const stagecontracts = stages.length > 0 ? validatestageflow(stages) : [];
  return async (agent) => {
    const env = agent.env;
    if (!env || typeof env !== 'object') {
      throw new Error('[PIPELINE] agent.env is required');
    }
    env._rerunStages = async (fromIndex) => {
      for (let idx = fromIndex; idx < stages.length; idx++) {
        const stage = stages[idx];
        await callwithstack(EVALSTACK, 'rerun-' + idx, 'asyncawait', async () => {
          const patch = await stage(env);
          if (patch && typeof patch === 'object') {
            const updateworldmap = env.updateworldmap;
            if (updateworldmap) updateworldmap(patch);
          }
        }, [], { context: { env } });
      }
    };
    for (let idx = 0; idx < stages.length; idx++) {
      const stage = stages[idx];
      const stageid = stage.id || 'stage_' + idx;
      const callerid = agent.id + ':' + stageid;
      if (stage.control && stage.control.command !== 'TRIGGER' && stage.control.command !== 'LOOP') {
        if (stage.control.fn) {
          const shouldexecute = await stage.control.fn(env);
          if (!shouldexecute) {
            logdebug('[PIPELINE] Skipping stage:', stageid, 'control condition false');
            continue;
          }
        }
      }
      logdebug('[PIPELINE] Executing stage:', stageid, 'for agent:', agent.id);
      await callwithstack(EVALSTACK, 'stage-' + idx + ':' + (stage.intent || "unnamed"), "asyncawait", async () => {
        const patch = await stage(env);
        if (patch && typeof patch === "object") {
          const updateworldmap = env.updateworldmap;
          if (updateworldmap) updateworldmap(patch);
        }
        return env;
      }, [], {
        context: { env, pipestate: env.pipestate, callerid },
        errk: (err) => {
          err.diagnostic = err.diagnostic || {};
          err.diagnostic.pipelinestage = stageid;
          throw err;
        }
      });
    }
    return env;
  };
};
