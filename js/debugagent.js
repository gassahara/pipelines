import { frames } from './evalstack.js';
import { formatdebugtrace } from './debugformatter.js';
import { logdebug, logwarn } from './verbosity.js';
import { enqueueExecutionCccAbort, enqueueExecutionCccContinue, enqueueExecutionCccRetry } from './actors/executionactor.js';

let currentcontinuation = null;

const getctx = (error, cont) => {
    const env = cont?.envsnapshot || cont?.options?.context?.env || {};
    return {
        pipelineid: env.pipelineid || env.agentid || error?.diagnostic?.pipelineid || 'unknown_pipeline',
        path: [error?.diagnostic?.pipelinestage || 'unknown_stage', error?.diagnostic?.blockid || error?.diagnostic?.elementid || 'unknown_element'],
        elementid: error?.diagnostic?.blockid || error?.diagnostic?.elementid || 'unknown_element'
    };
};

const btn = (text, style, onclick) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `border:none; padding:10px 20px; cursor:pointer; font-weight:bold; ${style}`;
    b.onclick = onclick;
    return b;
};

export function installdebugagent(overlayid = 'debugoverlay') {
    let overlay = document.getElementById(overlayid);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayid;
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:10000;display:none;flex-direction:column;';
        document.body.appendChild(overlay);
    }

    const hide = () => { overlay.style.display = 'none'; overlay.innerHTML = ''; };

    const show = (error, continuation) => {
        currentcontinuation = continuation;
        overlay.innerHTML = formatdebugtrace(error, error?.diagnostic?.debugtrace || frames);

        const actions = document.createElement('div');
        actions.style.cssText = 'position:fixed;bottom:40px;right:40px;display:flex;gap:20px;';

        if (continuation) {
            const ctx = getctx(error, continuation);
            actions.appendChild(btn('RETRY STAGE', 'background:#00ff00;color:#000;', () => {
                logdebug('[DebugAgent] Retrying:', ctx);
                hide();
                enqueueExecutionCccRetry(ctx.pipelineid, ctx.path, ctx.elementid).catch(e => console.warn('[DebugAgent] RETRY failed:', e));
                if (typeof continuation.fn === 'function') continuation.fn(...continuation.args).catch(e => show(e, e.diagnostic?.continuation || null));
            }));
            actions.appendChild(btn('CONTINUE', 'background:#4488ff;color:#fff;', () => {
                logdebug('[DebugAgent] Continuing:', ctx);
                hide();
                enqueueExecutionCccContinue(ctx.pipelineid, ctx.path, ctx.elementid).catch(e => console.warn('[DebugAgent] CONTINUE failed:', e));
                const resume = continuation?.args?.[0]?.pipelineresume;
                if (typeof resume === 'function') resume();
                else logwarn('[DebugAgent] No pipeline.resume on stack.');
            }));
        }

        actions.appendChild(btn('ABORT', 'background:#ff5555;color:#fff;', () => {
            const ctx = currentcontinuation
                ? getctx(null, currentcontinuation)
                : { pipelineid: 'unknown_pipeline', path: ['unknown_stage', 'unknown_element'], elementid: 'unknown_element' };
            logdebug('[DebugAgent] Aborting:', ctx);
            hide();
            enqueueExecutionCccAbort(ctx.pipelineid, ctx.path, ctx.elementid).catch(e => console.warn('[DebugAgent] ABORT failed:', e));
        }));

        overlay.appendChild(actions);
        overlay.style.display = 'flex';
    };

    window.debugagentshow = show;
    window.addEventListener('unhandledrejection', (e) => {
        if (e.reason?.diagnostic) { show(e.reason, e.reason.diagnostic.continuation || null); e.preventDefault(); }
    });
    window.addEventListener('error', (e) => { show(e.error || e, null); e.preventDefault(); });
}
