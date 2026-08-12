export const createactor = (behavior, initialstate) => {
    let currentstate = initialstate;
    const mailbox = [];
    let scheduled = false;
    let drainpromise = null;
    let drainresolve = null;

    const drain = () => {
        if (mailbox.length === 0) {
            scheduled = false;
            if (drainresolve) {
                const res = drainresolve;
                drainresolve = null;
                drainpromise = null;
                res(currentstate);
            }
            return;
        }
        const message = mailbox.shift();
        currentstate = behavior(currentstate, message);
        queueMicrotask(drain);
    };

    const send = (message) => {
        mailbox.push(message);
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(drain);
        }
    };

    const waitforemptymailbox = () => {
        if (!scheduled && mailbox.length === 0) return Promise.resolve(currentstate);
        if (!drainpromise) {
            drainpromise = new Promise(resolve => { drainresolve = resolve; });
        }
        return drainpromise;
    };

    const getstate = () => currentstate;

    return Object.freeze({ send, getstate, waitforemptymailbox });
};

/**
 * Creates a message validator function bound to a specific message interface map.
 * Replaces the duplicate validatemessage logic in apiactor.js and renderactor.js.
 * @param {Object} interfaceMap - Map of message type to required fields with type hints (e.g., 'string?').
 * @returns {Function} A validator that accepts a message and returns { valid, error, type }.
 */
export function createMessageValidator(interfaceMap) {
    return (message) => {
        if (!message || typeof message !== 'object') {
            return { valid: false, error: 'message must be a non-null object', type: 'null' };
        }
        var type = message.type;
        if (!type || typeof type !== 'string') {
            return { valid: false, error: 'message type must be a string, got: ' + typeof type, type: String(type) };
        }
        var iface = interfaceMap[type];
        if (!iface) {
            return { valid: false, error: 'unknown message type: ' + type, type: type };
        }
        var keys = Object.keys(iface);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var spec = iface[key];
            var optional = spec.charAt(spec.length - 1) === '?';
            var expectedtype = optional ? spec.slice(0, -1) : spec;
            if (message[key] === undefined || message[key] === null) {
                if (!optional) {
                    return { valid: false, error: 'type "' + type + '" missing required field "' + key + '" (' + expectedtype + ')', type: type };
                }
                continue;
            }
            if (expectedtype === 'any') continue;
            var actualtype = typeof message[key];
            if (actualtype !== expectedtype) {
                return { valid: false, error: 'type "' + type + '" field "' + key + '" expected ' + expectedtype + ' got ' + actualtype, type: type };
            }
        }
        return { valid: true, error: null, type: type };
    };
}
