// triggerregistry.js – Framework trigger garbage collector
// Maintains a map of registered TRIGGER listeners and re‑attaches them
// after DOM mutations that may destroy elements.

const triggerMap = new Map();

/**
 * Registers a trigger so it can be restored after DOM changes.
 * @param {string} id - The DOM element id (sourceid).
 * @param {string} event - The event type (e.g., 'click').
 * @param {Function} handler - The event handler function.
 */
export function registerTrigger(id, event, handler) {
    triggerMap.set(id, { event, handler });
}

/**
 * Removes a trigger from the registry.
 * @param {string} id - The DOM element id.
 */
export function unregisterTrigger(id) {
    triggerMap.delete(id);
}

/**
 * Re‑validates all registered triggers by checking if their target elements
 * exist in the DOM and, if so, re‑attaching the listener.
 * This should be called after any DOM mutation that might destroy elements.
 */
export function revalidateAll() {
    triggerMap.forEach((data, id) => {
        const el = document.getElementById(id);
        if (el) {
            // Remove any existing listener (old element would have been destroyed, but safe)
            el.removeEventListener(data.event, data.handler);
            // Attach fresh listener on the new element
            el.addEventListener(data.event, data.handler);
        }
    });
}

// Optional: expose for debugging
export function getTriggerMap() {
    return triggerMap;
}
