// Suggests which existing entity a draft (created inline with `#`) probably is. Deterministic
// string similarity only; the writer decides. Explicit .ts extension for the test runner.

export type KnownEntity = { id: string; label: string; type: string; aliases: string[] };

export type MatchSuggestion = { entity: KnownEntity; score: number; reason: string };

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s_\-–./,()]+/g, ' ')
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalise(text).split(' ').filter((token) => token.length > 1));
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const distance = Array.from({ length: rows }, (_row, index) => [index, ...Array(cols - 1).fill(0)]);
  for (let column = 1; column < cols; column += 1) {
    distance[0][column] = column;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < cols; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      distance[row][column] = Math.min(distance[row - 1][column] + 1, distance[row][column - 1] + 1, distance[row - 1][column - 1] + cost);
    }
  }
  return distance[rows - 1][cols - 1];
}

function scoreAgainst(label: string, candidate: string): { score: number; reason: string } | null {
  const left = normalise(label);
  const right = normalise(candidate);
  if (!left || !right) {
    return null;
  }
  if (left === right) {
    return { score: 1, reason: 'same name' };
  }
  if (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))) {
    return { score: 0.8, reason: 'one name contains the other' };
  }
  if (left.length >= 5 && levenshtein(left, right) <= 2) {
    return { score: 0.7, reason: 'spelling differs slightly' };
  }
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  if (shared > 0 && union > 0 && shared / union >= 0.5) {
    return { score: 0.6, reason: 'shares most words' };
  }
  return null;
}

// Best matches for `label` among `known`, strongest first, at most `limit`.
export function suggestMatches(label: string, known: KnownEntity[], limit = 3): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  for (const entity of known) {
    let best: { score: number; reason: string } | null = null;
    for (const name of [entity.label, ...entity.aliases]) {
      const scored = scoreAgainst(label, name);
      if (scored && (!best || scored.score > best.score)) {
        best = name === entity.label ? scored : { score: scored.score - 0.05, reason: `alias “${name}” ${scored.reason}` };
      }
    }
    if (best) {
      suggestions.push({ entity, ...best });
    }
  }
  return suggestions.sort((left, right) => right.score - left.score || left.entity.label.localeCompare(right.entity.label)).slice(0, limit);
}
