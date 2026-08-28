// Derives *usages* — which entity was used with which amounts, in which role — from the prose
// itself. Deterministic, adjacency-based; no semantics beyond a few chemistry keywords.
// Explicit extension so Node's type-stripping test runner (and the server) can resolve it.
import { findUnit, type Quantity } from '../units/quantity.ts';

export type UsageRole = 'reactant' | 'product' | 'solvent' | null;

export type Usage = {
  entityId: string;
  label: string;
  entityType: string | null;
  quantities: Quantity[];
  role: UsageRole;
  blockIndex: number;
  // The sentence the usage was read from, as plain text, for provenance.
  sentence: string;
};

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'entity'; id: string; label: string; entityType: string | null }
  | { kind: 'quantity'; value: number; unit: string };

type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

// Only amounts count as usage; time and temperature describe conditions.
const AMOUNT_DIMENSIONS = new Set(['mass', 'volume', 'amount', 'concentration', 'ratio']);

const PRODUCT_WORDS = /\b(afford(?:ed|ing)?|gave|give[sn]?|yield(?:ed|ing|s)?|obtain(?:ed|ing)?|isolat(?:ed|ing)|furnish(?:ed)?|product|to give|resulting in)\b/i;
const SOLVENT_TAIL = /\b(in|dissolved in|suspended in|diluted with|taken up in|washed with|extracted with|eluted with)\s*$/i;

function inlineTokens(node: JsonNode, out: Token[]): void {
  switch (node.type) {
    case 'text':
      out.push({ kind: 'text', text: node.text ?? '' });
      return;
    case 'entityMention': {
      const id = node.attrs?.id;
      if (id !== null && id !== undefined && id !== '') {
        out.push({
          kind: 'entity',
          id: String(id),
          label: typeof node.attrs?.label === 'string' ? node.attrs.label : String(id),
          entityType: typeof node.attrs?.entityType === 'string' ? node.attrs.entityType : null
        });
      }
      return;
    }
    case 'quantity': {
      const value = Number(node.attrs?.value);
      const unit = String(node.attrs?.unit ?? '');
      if (Number.isFinite(value) && unit) {
        out.push({ kind: 'quantity', value, unit });
      }
      return;
    }
    case 'hardBreak':
      out.push({ kind: 'text', text: ' ' });
      return;
    default:
      (node.content ?? []).forEach((child) => inlineTokens(child, out));
  }
}

// Blocks that carry prose: paragraphs and headings, including those nested in lists/quotes/cells.
function proseBlocks(node: JsonNode, out: JsonNode[]): void {
  if (node.type === 'paragraph' || node.type === 'heading') {
    out.push(node);
    return;
  }
  if (node.type === 'reaction' || node.type === 'blockMath' || node.type === 'image') {
    return;
  }
  (node.content ?? []).forEach((child) => proseBlocks(child, out));
}

// Splits a token stream into sentences at ". ", "; " and end of block (decimal points are safe:
// numbers with units are already quantity tokens).
function sentences(tokens: Token[]): Token[][] {
  const result: Token[][] = [];
  let current: Token[] = [];

  for (const token of tokens) {
    if (token.kind !== 'text') {
      current.push(token);
      continue;
    }
    const parts = token.text.split(/(?<=[.;!?])\s+/);
    parts.forEach((part, index) => {
      if (part) {
        current.push({ kind: 'text', text: part });
      }
      if (index < parts.length - 1) {
        result.push(current);
        current = [];
      }
    });
  }

  if (current.length > 0) {
    result.push(current);
  }
  return result;
}

function textOf(tokens: Token[]): string {
  return tokens
    .map((token) => (token.kind === 'text' ? token.text : token.kind === 'entity' ? token.label : `${token.value} ${token.unit}`))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAmount(token: Token): token is Extract<Token, { kind: 'quantity' }> {
  if (token.kind !== 'quantity') {
    return false;
  }
  const unit = findUnit(token.unit);
  return Boolean(unit && AMOUNT_DIMENSIONS.has(unit.dimension));
}

// Assigns each amount token in a sentence to an entity token.
function bindQuantities(sentence: Token[]): Map<number, number[]> {
  const bindings = new Map<number, number[]>();
  const claimed = new Set<number>();
  const entityIndexes = sentence.map((token, index) => (token.kind === 'entity' ? index : -1)).filter((index) => index >= 0);

  const claim = (entityIndex: number, quantityIndex: number) => {
    if (claimed.has(quantityIndex)) {
      return;
    }
    claimed.add(quantityIndex);
    bindings.set(entityIndex, [...(bindings.get(entityIndex) ?? []), quantityIndex]);
  };

  for (const entityIndex of entityIndexes) {
    // 1. Parenthetical right after the entity: "#X (2.0 g, 14.5 mmol)".
    const next = sentence[entityIndex + 1];
    if (next?.kind === 'text' && /^\s*\(\s*$/.test(next.text)) {
      for (let index = entityIndex + 2; index < sentence.length; index += 1) {
        const token = sentence[index];
        if (token.kind === 'text') {
          if (token.text.includes(')')) {
            break;
          }
          if (!/^[\s,;/and]*$/i.test(token.text)) {
            break;
          }
          continue;
        }
        if (token.kind === 'entity') {
          break;
        }
        if (isAmount(token)) {
          claim(entityIndex, index);
        }
      }
    }

    // 2. Leading amounts: "12.5 mL of #X", "2 eq #X", "2 g and 5 mL of #X".
    let cursor = entityIndex - 1;
    while (cursor >= 0) {
      const token = sentence[cursor];
      if (token.kind === 'text') {
        if (/^\s*(of|and|,|\+)?\s*$/i.test(token.text)) {
          cursor -= 1;
          continue;
        }
        break;
      }
      if (isAmount(token)) {
        claim(entityIndex, cursor);
        cursor -= 1;
        continue;
      }
      break;
    }
  }

  // 3. Leftover amounts go to the nearest entity within a few tokens.
  sentence.forEach((token, index) => {
    if (!isAmount(token) || claimed.has(index)) {
      return;
    }
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entityIndex of entityIndexes) {
      const distance = Math.abs(entityIndex - index);
      if (distance < bestDistance) {
        best = entityIndex;
        bestDistance = distance;
      }
    }
    if (best >= 0 && bestDistance <= 4) {
      claim(best, index);
    }
  });

  return bindings;
}

function roleFor(sentence: Token[], entityIndex: number, hasAmount: boolean): UsageRole {
  const before = textOf(sentence.slice(0, entityIndex));
  if (SOLVENT_TAIL.test(before)) {
    return 'solvent';
  }
  const around = textOf(sentence);
  if (PRODUCT_WORDS.test(before) || (PRODUCT_WORDS.test(around) && /\b(as|of)\s*$/i.test(before))) {
    return 'product';
  }
  return hasAmount ? 'reactant' : null;
}

export function extractUsages(content: JsonNode | null | undefined): Usage[] {
  if (!content) {
    return [];
  }

  const blocks: JsonNode[] = [];
  (content.content ?? []).forEach((child) => proseBlocks(child, blocks));

  const usages: Usage[] = [];

  blocks.forEach((block, blockIndex) => {
    const tokens: Token[] = [];
    inlineTokens(block, tokens);
    if (!tokens.some((token) => token.kind === 'entity')) {
      return;
    }

    for (const sentence of sentences(tokens)) {
      const bindings = bindQuantities(sentence);
      sentence.forEach((token, index) => {
        if (token.kind !== 'entity') {
          return;
        }
        const quantities = (bindings.get(index) ?? []).map((quantityIndex) => {
          const quantity = sentence[quantityIndex] as Extract<Token, { kind: 'quantity' }>;
          return { value: quantity.value, unit: quantity.unit };
        });
        usages.push({
          entityId: token.id,
          label: token.label,
          entityType: token.entityType,
          quantities,
          role: roleFor(sentence, index, quantities.length > 0),
          blockIndex,
          sentence: textOf(sentence)
        });
      });
    }
  });

  return usages;
}

// One entry per entity, first occurrence wins for label/role, quantities de-duplicated by unit
// (first amount of each dimension). Used to seed reaction tables.
export function summariseUsages(usages: Usage[]): Usage[] {
  const byEntity = new Map<string, Usage>();
  for (const usage of usages) {
    const existing = byEntity.get(usage.entityId);
    if (!existing) {
      byEntity.set(usage.entityId, { ...usage, quantities: [...usage.quantities] });
      continue;
    }
    if (!existing.role && usage.role) {
      existing.role = usage.role;
    }
    for (const quantity of usage.quantities) {
      const dimension = findUnit(quantity.unit)?.dimension;
      if (!existing.quantities.some((item) => findUnit(item.unit)?.dimension === dimension)) {
        existing.quantities.push(quantity);
      }
    }
  }
  return [...byEntity.values()];
}
