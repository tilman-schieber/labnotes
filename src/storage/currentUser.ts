// The person at the keyboard. There is no login: the sidebar offers the registry's users and the
// choice is kept in this browser. Signing, batch codes and clones read it; the server never
// infers it and always receives an explicit user id.
const STORAGE_KEY = 'lab-notebook-user';

type Listener = (userId: string | null) => void;

const listeners = new Set<Listener>();
let current: string | null | undefined;

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getCurrentUserId(): string | null {
  if (current === undefined) {
    current = read();
  }
  return current;
}

export function setCurrentUserId(userId: string | null): void {
  current = userId;
  try {
    if (userId) {
      window.localStorage.setItem(STORAGE_KEY, userId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or blocked storage: the choice lasts for this page load only.
  }
  listeners.forEach((listener) => listener(userId));
}

export function onCurrentUser(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
