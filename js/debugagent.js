import { frames } from './evalstack.js';
import { formatdebugtrace } from './debugformatter.js';
import { logdebug, logwarn } from './verbosity.js';
import {
  enqueueExecutionCccAbort,
  enqueueExecutionCccContinue,
  enqueueExecutionCccRetry
} from './actors/executionactor.js';

let currentcontinuation = null;

const getbyid = (id) => document.getElementById(id);

const getPipelineContextFromContinuation = (error, continuation) => {
  const env = continuation?.envsnapshot || continuation?.options?.context?.env || {};
  const pipelineid =
    env.pipelineid ||
    env.agentid ||
    error?.diagnostic?.pipelineid ||
    'unknown_pipeline';

  const topStageid = error?.diagnostic?.pipelinestage || 'unknown_stage';
  const elementid = error?.diagnostic?.blockid || error?.diagnostic?.elementid || 'unknown_element';

  return {
    pipelineid,
    path: [topStageid, elementid],
    elementid
  };
};

export function installdebugagent(overlayid = 'debugoverlay') {
    let overlay = getbyid(overlayid);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayid;
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:10000; display:none; flex-direction: column;';
        document.body.appendChild(overlay);
    }

    const show = (error, continuation) => {
        currentcontinuation = continuation;
        const tracedata = error?.diagnostic?.debugtrace || frames;
        overlay.innerHTML = formatdebugtrace(error, tracedata);

        const actions = document.createElement('div');
        actions.style.cssText = 'position: fixed; bottom: 40px; right: 40px; display:flex; gap:20px;';

        if (continuation) {
            const ctx = getPipelineContextFromContinuation(error, continuation);

            const retrybtn = document.createElement('button');
            retrybtn.textContent = 'RETRY STAGE';
            retrybtn.style.cssText = 'background: #00ff00; color: #000; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold;';
            retrybtn.onclick = () => {
                logdebug('[DebugAgent] Retrying element:', ctx);
                hide();

                enqueueExecutionCccRetry(ctx.pipelineid, ctx.path, ctx.elementid)
                    .catch(err => {
                        console.warn('[DebugAgent] CCC_RETRY failed:', err);
                    });

                if (continuation && typeof continuation.fn === 'function') {
                    continuation.fn(...continuation.args)
                        .catch(err => show(err, err.diagnostic?.continuation || null));
                } else {
                    logdebug('[DebugAgent] continuation.fn is not callable:', continuation);
                }
            };
            actions.appendChild(retrybtn);

            const continuebtn = document.createElement('button');
            continuebtn.textContent = 'CONTINUE';
            continuebtn.style.cssText = 'background: #4488ff; color: #fff; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold;';
            continuebtn.onclick = () => {
                logdebug('[DebugAgent] Continuing past element:', ctx);
                hide();

                enqueueExecutionCccContinue(ctx.pipelineid, ctx.path, ctx.elementid)
                    .catch(err => {
                        console.warn('[DebugAgent] CCC_CONTINUE failed:', err);
                    });

                const env = continuation?.args?.[0];
                const resume = env && typeof env === 'object'
                    ? env.pipelineresume
                    : null;

                if (typeof resume === 'function') {
                    resume();
                } else {
                    logwarn('[DebugAgent] No pipeline.resume service on stack. Cannot continue past this stage.');
                }
            };
            actions.appendChild(continuebtn);
        }

        const abortbtn = document.createElement('button');
        abortbtn.textContent = 'ABORT';
        abortbtn.style.cssText = 'background: #ff5555; color: #fff; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold;';
        abortbtn.onclick = () => {
            const ctx = currentcontinuation
                ? getPipelineContextFromContinuation(null, currentcontinuation)
                : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };

            logdebug('[DebugAgent] Aborting stage:', ctx);
            hide();

            enqueueExecutionCccAbort(ctx.pipelineid, ctx.path, ctx.elementid)
                .catch(err => {
                    console.warn('[DebugAgent] CCC_ABORT failed:', err);
                });
        };
        actions.appendChild(abortbtn);

        overlay.appendChild(actions);
        overlay.style.display = 'flex';
    };

    const hide = () => {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    };

    window.debugagentshow = show;
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        if (reason && reason.diagnostic) {
            show(reason, reason.diagnostic.continuation || null);
            event.preventDefault();
        }
    });
    window.addEventListener('error', (event) => {
        show(event.error || event, null);
        event.preventDefault();
    });
}
