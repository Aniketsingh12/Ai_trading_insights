/**
 * Access passcode — held in localStorage, sent as X-API-Key on every request.
 *
 * This is deliberately not a login system. There is one shared secret, no
 * accounts, no sessions, no reset flow: the app has one owner, and everything
 * a login would add is attack surface with nothing behind it.
 *
 * The pub/sub exists because api.js is a plain module, not a component — when a
 * request comes back 401 it needs to reach the React tree to raise the prompt.
 */
const STORAGE_KEY = 'mm_access_key';

export const getKey = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return ''; // private mode / storage disabled
  }
};

export const setKey = (key) => {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do — the in-memory request still carries the key */
  }
  listeners.forEach((fn) => fn(key));
};

const listeners = new Set();

/** Called by the UI to react to the key changing. Returns an unsubscribe. */
export function onKeyChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let promptFor = null;

/** The gate component registers here so a 401 anywhere can raise it. */
export function registerPrompt(fn) {
  promptFor = fn;
  return () => { promptFor = null; };
}

export function requestKey() {
  promptFor?.();
}

/** Thrown on 401 so callers can tell "needs passcode" from a real failure. */
export class AccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AccessError';
  }
}

/**
 * True when a failure was only a missing passcode. The gate already opened by
 * itself, so callers use this to skip the toast rather than stack a second
 * message on top of the dialog.
 */
export const isAccessError = (e) => e?.name === 'AccessError';
