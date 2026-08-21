/**
 * The visitor's chosen model preset, remembered in this browser.
 *
 * Sent as a header on every request rather than a query param so it doesn't
 * fragment React Query's cache keys — the same ticker under a different preset
 * is still the same resource as far as the free, unmetered routes are concerned.
 */
const STORAGE_KEY = 'mm_model_preset';

const listeners = new Set();

export const getPreset = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return ''; // private mode / storage disabled
  }
};

export const setPreset = (id) => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* the in-flight request still carries it; only persistence is lost */
  }
  listeners.forEach((fn) => fn(id));
};

/** Subscribe to preset changes. Returns an unsubscribe. */
export function onPresetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
