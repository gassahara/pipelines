import { callwithstack } from "./factory/callwithstack.js";
import { EVALSTACK } from "./evalstack.js";
import { logdebug } from "./verbosity.js";

export const createpipeline = (stages, sinks = [], onprogress) => {
  if (!Array.isArray(stages)) throw new Error("[PIPELINE] Stages must be an array.");

  // Runtime promise stack for async stages.
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

    if (!isAsync) {
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
      return;
    }

    const reads = meta.reads || [];
    const writes = meta.writes || [];

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
    );

    stageStack.push({ promise, reads, writes, stageid });
  };

  const runAll = async (env, fromIndex = 0) => {
    for (let idx = fromIndex; idx < stages.length; idx++) {
      const stage = stages[idx];
      const stageid = stage.id || 'stage_' + idx;
      const callerid = env.agentid + ':' + stageid;
      const stageMeta = stage.stagemeta || {};
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
