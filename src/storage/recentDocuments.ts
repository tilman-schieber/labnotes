// The last few documents opened in this browser, newest first. Purely a convenience for the
// sidebar; nothing else depends on it.
const STORAGE_KEY = 'lab-notebook-recent';
const MAX = 6;

export function readRecentDocuments(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentDocument(id: string): string[] {
  const next = [id, ...readRecentDocuments().filter((item) => item !== id)].slice(0, MAX);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the list lasts for this page load only.
  }
  return next;
}
