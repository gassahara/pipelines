import { frames } from './evalstack.js';

export function formatdebugtrace(error, framelist = frames) {
    var err = error || {};
    var message = (typeof err === 'string') ? err : (err.message || 'Unknown error');
    var list = Array.isArray(framelist) ? framelist : [];
    var framelistcopy = list.slice();

    let html = ''
    + '<div class="debug-trace" style="font-family:monospace; background:#111; color:#eee; padding:2rem; overflow-y:auto; height:100vh; font-size: 14px; line-height: 1.6;">\n'
    + '  <h3 style="color:#ff5555; border-bottom: 2px solid #ff5555; padding-bottom: 0.5rem; margin-top: 0;">FATAL EXCEPTION :: SYSTEM_HALT</h3>\n'
    + '  <p style="font-size: 1.2em; color: #fff;"><strong>Error:</strong> ' + message + '</p>\n'
    + '  <div style="margin-top: 1.5rem; color: #888; text-transform: uppercase; font-size: 0.8em; letter-spacing: 1px;">Pervasive Continuation Trace</div>\n'
    + '  <ul style="list-style:none; padding:0; margin-top: 1rem;">';

    framelistcopy.reverse().forEach((frame, idx) => {
        const fnname = frame.meta?.label || frame.fn?.name || 'anonymous';
        const callerid = frame.meta?.callerid || 'unknown';

        const argarray = Array.isArray(frame.args) ? frame.args : [frame.args];
        const safeargs = argarray.map(a => {
            if (a === null) return 'null';
            if (typeof a === 'undefined') return 'undefined';
            if (typeof a === 'object') {
                try { 
                    const str = JSON.stringify(a, (key, value) => {
                        if (key === 'container' || key === 'canvas' || value instanceof HTMLElement) return '[DOM_NODE]';
                        return value;
                    });
                    return str.length > 120 ? str.slice(0, 120) + '...' : str;
                } catch { return '{…}'; }
            }
            return String(a).slice(0, 120);
        }).join(', ');

        const pipestatekeys = frame.pipestate ? Object.keys(frame.pipestate).join(', ') : 'none';

        html += ''
        + '\n        <li style="margin-bottom:1.5rem; border-left:4px solid #333; padding-left:1rem; position: relative;">\n'
        + '          <span style="color:#f0f; font-weight: bold;">#' + (framelistcopy.length - 1 - idx) + '</span>\n'
        + '          <span style="color:#0ff; font-weight: bold; margin-left: 0.5rem;">' + fnname + '</span>\n'
        + '          <span style="color:#aa0; font-size:0.8rem; margin-left: 0.5rem;">[' + callerid + ']</span>\n'
        + '          <div style="margin-top:0.3rem; color:#666; font-size: 0.9em;">Args: <span style="color: #aaa;">(' + safeargs + ')</span></div>\n'
        + '          <div style="color:#666; font-size: 0.9em;">Pipe State: <span style="color: #888;">{' + pipestatekeys + '}</span></div>\n'
        + '        </li>';
    });

    html += '</ul></div>';
    return html;
}
