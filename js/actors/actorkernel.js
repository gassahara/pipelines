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
