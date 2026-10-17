// Derives *placements* and *transfers* from the prose: where something was put, and what was
// made or taken from what. Both become relations in the registry, with the sentence as source.
//
//   "Stored #Batch 7 in #Freezer 2, box 3"        → Batch 7  stored_in    Freezer 2
//   "Took 2 mL of #Stock A into #Tube 14"          → Tube 14  derived_from Stock A  (2 mL)
//   "Aliquoted #Lysate into #Cryotube 1 and #Cryotube 2" → each tube derived_from Lysate
import { inlineTokens, proseBlocks, sentences, type Token } from './usages.ts';

export type Transfer = {
  kind: 'stored_in' | 'derived_from';
  subjectId: string;
  subjectLabel: string;
  objectId: string;
  objectLabel: string;
  quantity: { value: number; unit: string } | null;
  blockIndex: number;
  sentence: string;
};

type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

const STORE_WORDS = String.raw`stor(?:e|ed|ing)|plac(?:e|ed|ing)|put|kept|keep|keeping|returned?|returning|filed|parked|moved?|moving|transferred|transferring`;
const STORE_VERB = new RegExp(String.raw`\b(?:${STORE_WORDS})\b[^.;]*$`, 'i');
// "in #B", "back into #B", "was put back into #B": the verb may sit between the two entities.
const PLACE_LINK = new RegExp(String.raw`^\s*(?:was|were|is|are|got)?\s*(?:${STORE_WORDS})?\s*(?:back\s+)?(?:in|into|at|to|on|onto)\s*(?:the\s+)?$`, 'i');
const STORE_IN_LINK = new RegExp(String.raw`\b(?:${STORE_WORDS})\b`, 'i');
const TRANSFER_VERB = /\b(took|take|taken|taking|transferr?(?:ed|ing)?|pipett(?:e|ed|ing)|aliquot(?:ed|ing)?|aliquots?|pour(?:ed|ing)?|dispens(?:e|ed|ing)|withdr(?:ew|aw|awn)|split|inoculat(?:e|ed|ing)|seed(?:ed|ing)?|streak(?:ed|ing)?|plated?|harvest(?:ed|ing)?|passag(?:e|ed|ing))\b/i;
const FROM_LINK = /\b(?:of|from)\s*(?:the\s+)?$/i;
// "into #B", "culture into #B": a word or two of apposition may sit between the source and the preposition.
const INTO_LINK = /^\s*(?:[A-Za-z]+\s+){0,2}(?:into|to|in|onto|on)\s*(?:the\s+)?$/i;
const AND_LINK = /^\s*(?:,|and|,\s*and)\s*$/i;

function textOf(tokens: Token[]): string {
  return tokens
    .map((token) => (token.kind === 'text' ? token.text : token.kind === 'entity' ? token.label : `${token.value} ${token.unit}`))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// Text of the tokens strictly between two indexes; null when something other than text sits there.
function between(sentence: Token[], from: number, to: number): string | null {
  let text = '';
  for (let index = from + 1; index < to; index += 1) {
    const token = sentence[index];
    if (token.kind !== 'text') {
      return null;
    }
    text += token.text;
  }
  return text;
}

// The entity tokens that follow `index` joined by "and" / ",": "#Tube 1 and #Tube 2".
function listAfter(sentence: Token[], index: number): number[] {
  const found = [index];
  let cursor = index;
  while (cursor + 2 < sentence.length) {
    const link = between(sentence, cursor, cursor + 2);
    if (link === null || !AND_LINK.test(link) || sentence[cursor + 2].kind !== 'entity') {
      break;
    }
    cursor += 2;
    found.push(cursor);
  }
  return found;
}

export function transfersFromSentence(sentence: Token[], blockIndex: number): Transfer[] {
  const found: Transfer[] = [];
  const text = textOf(sentence);
  const entityIndexes = sentence.map((token, index) => (token.kind === 'entity' ? index : -1)).filter((index) => index >= 0);

  for (const index of entityIndexes) {
    const subject = sentence[index] as Extract<Token, { kind: 'entity' }>;
    const previous = sentence[index - 1];
    const beforeText = previous?.kind === 'text' ? previous.text : previous?.kind === 'quantity' ? '' : null;
    if (beforeText === null) {
      continue;
    }
    // Everything said before this entity in the sentence, for the verb.
    const lead = textOf(sentence.slice(0, index));

    // "stored #A in #B": the next entity after a place word is where A went.
    const targets = entityIndexes.filter((other) => other > index);
    let anchor = index;
    for (const target of targets) {
      const link = between(sentence, anchor, target);
      if (link === null) {
        break;
      }
      // "stored #A and #B in #C": the place comes after the list.
      if (AND_LINK.test(link)) {
        anchor = target;
        continue;
      }
      const object = sentence[target] as Extract<Token, { kind: 'entity' }>;
      const isTransfer = TRANSFER_VERB.test(lead);
      const isStore = STORE_VERB.test(lead) || STORE_IN_LINK.test(link);
      const hasFrom = FROM_LINK.test(beforeText);
      const derive = () => {
        // "took 2 mL of #A into #B [and #C]": B (and C) come from A, with the amount taken.
        const quantityToken = [...sentence.slice(0, index)].reverse().find((token) => token.kind === 'quantity') as Extract<Token, { kind: 'quantity' }> | undefined;
        const quantity = quantityToken ? { value: quantityToken.value, unit: quantityToken.unit } : null;
        for (const destination of listAfter(sentence, target)) {
          const into = sentence[destination] as Extract<Token, { kind: 'entity' }>;
          found.push({ kind: 'derived_from', subjectId: into.id, subjectLabel: into.label, objectId: subject.id, objectLabel: subject.label, quantity, blockIndex, sentence: text });
        }
      };
      if (isTransfer && hasFrom && INTO_LINK.test(link)) {
        derive();
      } else if (isStore && PLACE_LINK.test(link)) {
        // "stored #A in #B", "moved #Plate to #Incubator", "#A was put back into #B".
        found.push({ kind: 'stored_in', subjectId: subject.id, subjectLabel: subject.label, objectId: object.id, objectLabel: object.label, quantity: null, blockIndex, sentence: text });
      } else if (isTransfer && INTO_LINK.test(link) && subject.entityType !== 'container' && subject.entityType !== 'location') {
        // "aliquoted the #Lysate into #Cryotube 1", "seeded #Cells into #Flask".
        derive();
      }
      break;
    }
  }
  return found;
}

export function extractTransfers(content: JsonNode | null | undefined): Transfer[] {
  if (!content) {
    return [];
  }
  const blocks: JsonNode[] = [];
  (content.content ?? []).forEach((child) => proseBlocks(child, blocks));
  const transfers: Transfer[] = [];
  blocks.forEach((block, blockIndex) => {
    const tokens: Token[] = [];
    inlineTokens(block, tokens);
    if (tokens.filter((token) => token.kind === 'entity').length < 2) {
      return;
    }
    for (const sentence of sentences(tokens)) {
      transfers.push(...transfersFromSentence(sentence, blockIndex));
    }
  });
  // One relation per pair and kind; the first sentence is the source.
  const seen = new Set<string>();
  return transfers.filter((transfer) => {
    const key = `${transfer.kind}|${transfer.subjectId}|${transfer.objectId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
