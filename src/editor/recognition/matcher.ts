// Finds known entity names in plain text. Deterministic: exact label/alias matches on word
// boundaries, case-insensitive, longest name wins, and nothing inside a `#query` is touched.

export type KnownEntity = { id: string; type: string; label: string; aliases: string[] };

export type Recognition = { start: number; end: number; entityId: string; label: string; type: string; matched: string };

const MIN_LENGTH = 3;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type Matcher = { regex: RegExp | null; byName: Map<string, KnownEntity> };

export function buildMatcher(entities: KnownEntity[]): Matcher {
  const byName = new Map<string, KnownEntity>();
  for (const entity of entities) {
    for (const name of [entity.label, ...entity.aliases]) {
      const trimmed = name.trim();
      if (trimmed.length >= MIN_LENGTH && !byName.has(trimmed.toLowerCase())) {
        byName.set(trimmed.toLowerCase(), entity);
      }
    }
  }

  if (byName.size === 0) {
    return { regex: null, byName };
  }

  // Longest first so "Lysis Buffer" beats "Buffer".
  const names = [...byName.keys()].sort((left, right) => right.length - left.length).map(escapeRegex);
  // Word boundaries that also work for names starting/ending with digits or symbols.
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_#@/])(${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return { regex, byName };
}

// True when `index` sits inside a pending suggestion query: a `#`/`@` at a word start earlier in
// the same clause. Those words belong to the popup until the writer accepts or dismisses it.
function insideTrigger(text: string, index: number): boolean {
  const clause = text.slice(0, index).split(/[.;!?]\s|\n/).pop() ?? '';
  return /(^|\s)[#@]\S/.test(clause);
}

export function findRecognitions(text: string, matcher: Matcher): Recognition[] {
  if (!matcher.regex) {
    return [];
  }

  const results: Recognition[] = [];
  matcher.regex.lastIndex = 0;
  for (const match of text.matchAll(matcher.regex)) {
    const matched = match[1];
    const entity = matcher.byName.get(matched.toLowerCase());
    if (!entity || match.index === undefined || insideTrigger(text, match.index)) {
      continue;
    }
    results.push({ start: match.index, end: match.index + matched.length, entityId: entity.id, label: entity.label, type: entity.type, matched });
  }
  return results;
}
