// triggerregistry.js – Framework trigger garbage collector
// Maintains a map of registered TRIGGER listeners and re‑attaches them
// after DOM mutations that may destroy elements.

const triggerMap = new Map(); // id -> Map(event, handler)

/**
 * Registers a trigger so it can be restored after DOM changes.
 * Does NOT overwrite handlers for other events on the same element.
 * @param {string} id - The DOM element id (sourceid).
 * @param {string} event - The event type (e.g., 'click').
 * @param {Function} handler - The event handler function.
 */
export function registerTrigger(id, event, handler) {
    if (!triggerMap.has(id)) {
        triggerMap.set(id, new Map());
    }
    triggerMap.get(id).set(event, handler);
}

/**
 * Removes a trigger from the registry.
 * If an event is provided, only that event is removed.
 * Otherwise the entire element entry is removed.
 * @param {string} id - The DOM element id.
 * @param {string} [event] - Optional event type to remove.
 */
export function unregisterTrigger(id, event = null) {
    if (event) {
        const events = triggerMap.get(id);
        if (events) {
            events.delete(event);
            if (events.size === 0) {
                triggerMap.delete(id);
            }
        }
    } else {
        triggerMap.delete(id);
    }
}

/**
 * Re‑validates all registered triggers by checking if their target elements
 * exist in the DOM and, if so, re‑attaching all stored listeners.
 * This should be called after any DOM mutation that might destroy elements.
 */
export function revalidateAll() {
    triggerMap.forEach((events, id) => {
        const el = document.getElementById(id);
        if (el) {
            events.forEach((handler, event) => {
                // Remove any existing listener (old element would have been destroyed, but safe)
                el.removeEventListener(event, handler);
                // Attach fresh listener on the new element
                el.addEventListener(event, handler);
            });
        }
    });
}

// Optional: expose for debugging
export function getTriggerMap() {
    return triggerMap;
}
