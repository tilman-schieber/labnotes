import { fetchEntityLabels, type BackendEntityLabel } from '../api/backend';

// A reference token stores the type the entity had when it was written. Classifying the entity
// later - by hand or by the background classifier - does not rewrite the documents that mention
// it, so tokens ask here for the registry's current answer instead of trusting their own attrs.
const types = new Map<string, string>();
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

export function entityType(id: string | null | undefined, fallback: string): string {
  return (id ? types.get(id) : undefined) ?? fallback;
}

// Called with the label list the recognition plugin already loads, so knowing the current types
// costs no extra request.
export function primeEntityTypes(entities: Pick<BackendEntityLabel, 'id' | 'type'>[]): void {
  let changed = false;
  for (const entity of entities) {
    if (types.get(entity.id) !== entity.type) {
      types.set(entity.id, entity.type);
      changed = true;
    }
  }

  if (changed) {
    for (const listener of listeners) {
      listener();
    }
  }
}

export function refreshEntityTypes(): Promise<void> {
  if (!inflight) {
    inflight = fetchEntityLabels()
      .then(primeEntityTypes)
      .catch(() => undefined)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function onEntityTypes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
