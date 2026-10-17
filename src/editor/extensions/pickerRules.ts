// When the `#` picker should get out of the way, and when an unknown name may become a draft.
// Spaces are allowed in a query so `#Lysis buffer` works, which means the picker is still open
// when the writer has moved on to the next words of the sentence. These rules decide, from the
// query text alone, whether it still looks like a name.

const MAX_NAME_WORDS = 3;

// Words that never occur inside an entity name but start the rest of a sentence.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'then', 'was', 'were', 'is', 'are', 'be', 'been',
  'to', 'into', 'onto', 'at', 'for', 'with', 'without', 'from', 'over', 'under', 'until', 'after', 'before',
  'added', 'add', 'stirred', 'stir', 'heated', 'heat', 'cooled', 'cool', 'washed', 'wash', 'dried', 'dry',
  'gave', 'afforded', 'yielded', 'obtained', 'dissolved', 'dissolve', 'diluted', 'mixed', 'mix'
]);

function words(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

// True once the typed text reads as prose rather than a name: sentence punctuation, too many
// words, or a word that only a sentence contains. "Dry" alone is fine; "toluene was" is not.
export function looksLikeProse(query: string): boolean {
  if (/[.,;:!?]$/.test(query)) {
    return true;
  }
  const parts = words(query);
  if (parts.length > MAX_NAME_WORDS) {
    return true;
  }
  // The first word is what the writer typed right after `#`; it is the name, whatever it is.
  return parts.slice(1).some((word) => STOP_WORDS.has(word.toLowerCase()));
}

// A draft may be created from a query that is short, non-empty and not prose.
export function canCreateDraft(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length > 0 && !looksLikeProse(trimmed);
}
