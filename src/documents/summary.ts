import type { JSONContent } from '@tiptap/core';
import { formatQuantity } from '../units/quantity.ts';

// What a feed row shows about a document without opening it: the first line of prose and the
// names it references, read straight from the stored editor JSON.

export type DocumentSummary = {
  firstLine: string;
  entities: { id: string; label: string; type: string }[];
};

const MAX_LINE = 160;

function inlineText(node: JSONContent): string {
  if (typeof node.text === 'string') {
    return node.text;
  }
  if (node.type === 'entityMention' || node.type === 'userMention') {
    return String(node.attrs?.label ?? '');
  }
  if (node.type === 'quantity') {
    return formatQuantity({ value: Number(node.attrs?.value ?? 0), unit: String(node.attrs?.unit ?? '') });
  }
  if (node.type === 'hardBreak') {
    return ' ';
  }
  return (node.content ?? []).map(inlineText).join('');
}

function collectEntities(node: JSONContent, into: Map<string, { id: string; label: string; type: string }>): void {
  if (node.type === 'entityMention' && node.attrs?.id && !into.has(String(node.attrs.id))) {
    into.set(String(node.attrs.id), { id: String(node.attrs.id), label: String(node.attrs.label ?? node.attrs.id), type: String(node.attrs.entityType ?? 'entity') });
  }
  if (node.type === 'reaction') {
    for (const component of (node.attrs?.components as { entityId?: string | null; label?: string }[] | undefined) ?? []) {
      if (component.entityId && !into.has(component.entityId)) {
        into.set(component.entityId, { id: component.entityId, label: component.label ?? component.entityId, type: 'compound' });
      }
    }
  }
  if (node.type === 'plate') {
    const plateId = node.attrs?.entityId as string | null | undefined;
    if (plateId && !into.has(plateId)) {
      into.set(plateId, { id: plateId, label: String(node.attrs?.title || 'plate'), type: 'container' });
    }
    for (const group of (node.attrs?.groups as { entityId?: string | null; label?: string; entityType?: string | null }[] | undefined) ?? []) {
      if (group.entityId && !into.has(group.entityId)) {
        into.set(group.entityId, { id: group.entityId, label: group.label ?? group.entityId, type: group.entityType ?? 'entity' });
      }
    }
  }
  if (node.type === 'results') {
    for (const row of (node.attrs?.rows as { entityId?: string | null; label?: string; entityType?: string | null }[] | undefined) ?? []) {
      if (row.entityId && !into.has(row.entityId)) {
        into.set(row.entityId, { id: row.entityId, label: row.label ?? row.entityId, type: row.entityType ?? 'entity' });
      }
    }
  }
  (node.content ?? []).forEach((child) => collectEntities(child, into));
}

export function summarizeDocument(content: JSONContent | null | undefined): DocumentSummary {
  const blocks = content?.content ?? [];
  // The first block is the title; the first textblock after it with any text is the line.
  let firstLine = '';
  for (const block of blocks.slice(1)) {
    const text = inlineText(block).replace(/\s+/g, ' ').trim();
    if (text) {
      firstLine = text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1).trimEnd()}…` : text;
      break;
    }
  }
  const entities = new Map<string, { id: string; label: string; type: string }>();
  blocks.slice(1).forEach((block) => collectEntities(block, entities));
  return { firstLine, entities: [...entities.values()] };
}
