import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { bindQuantities, sentences, type Token } from '../chemistry/usages';
import { findUnit, type Quantity } from '../units/quantity';

// The reaction table is a view of the prose above it. This module finds, in the editor
// document, the amount token that a table cell was read from, so an edit in the table can be
// written back to the sentence. Same binding rules as chemistry/usages.ts, with positions.

export type BoundQuantity = { pos: number; dimension: string; quantity: Quantity };

// Positions of the top-level blocks a reaction at `blockIndex` describes: from the last heading
// before it (inclusive) up to the reaction block (exclusive).
export function sectionRange(doc: ProseMirrorNode, blockIndex: number): { from: number; to: number } {
  const offsets: number[] = [];
  let offset = 0;
  doc.forEach((child) => {
    offsets.push(offset);
    offset += child.nodeSize;
  });

  let start = 0;
  for (let cursor = blockIndex - 1; cursor >= 0; cursor -= 1) {
    if (doc.child(cursor).type.name === 'heading') {
      start = cursor;
      break;
    }
  }
  return { from: offsets[start] ?? 0, to: offsets[blockIndex] ?? doc.content.size };
}

function blockTokens(block: ProseMirrorNode, blockPos: number): Token[] {
  const tokens: Token[] = [];
  block.descendants((node, pos) => {
    const absolute = blockPos + 1 + pos;
    if (node.isText) {
      tokens.push({ kind: 'text', text: node.text ?? '' });
      return false;
    }
    if (node.type.name === 'entityMention' && node.attrs.id) {
      tokens.push({ kind: 'entity', id: String(node.attrs.id), label: String(node.attrs.label ?? node.attrs.id), entityType: node.attrs.entityType ?? null, pos: absolute });
      return false;
    }
    if (node.type.name === 'quantity') {
      tokens.push({ kind: 'quantity', value: Number(node.attrs.value), unit: String(node.attrs.unit ?? ''), pos: absolute });
      return false;
    }
    if (node.type.name === 'hardBreak') {
      tokens.push({ kind: 'text', text: ' ' });
      return false;
    }
    return true;
  });
  return tokens;
}

// Every amount bound to an entity within [from, to), keyed by entity id, in document order.
export function findBoundQuantities(doc: ProseMirrorNode, from: number, to: number): Map<string, BoundQuantity[]> {
  const found = new Map<string, BoundQuantity[]>();

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') {
      return node.type.name !== 'reaction' && node.type.name !== 'blockMath';
    }
    if (pos < from || pos >= to) {
      return false;
    }

    for (const sentence of sentences(blockTokens(node, pos))) {
      const bindings = bindQuantities(sentence);
      for (const [entityIndex, quantityIndexes] of bindings) {
        const entity = sentence[entityIndex];
        if (entity.kind !== 'entity') {
          continue;
        }
        for (const quantityIndex of quantityIndexes) {
          const quantity = sentence[quantityIndex];
          if (quantity.kind !== 'quantity' || quantity.pos === undefined) {
            continue;
          }
          const dimension = findUnit(quantity.unit)?.dimension;
          if (!dimension) {
            continue;
          }
          found.set(entity.id, [...(found.get(entity.id) ?? []), { pos: quantity.pos, dimension, quantity: { value: quantity.value, unit: quantity.unit } }]);
        }
      }
    }
    return false;
  });

  return found;
}
