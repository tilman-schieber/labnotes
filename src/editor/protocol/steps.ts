// Protocol steps are list items: what you write as `- ` or `1. ` is a step, and nothing else is.
// Explicit extensions for the test runner.
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findUnit, formatQuantity, type Quantity } from '../../units/quantity.ts';

export type StepConditions = { duration: Quantity | null; temperature: Quantity | null };

export type ProtocolStep = {
  index: number;
  // Position of the list item, and a position inside its text for placing the caret.
  pos: number;
  textPos: number;
  text: string;
  ordered: boolean;
  // Task-list items carry their checkbox; plain list items are never done.
  done: boolean;
  conditions: StepConditions;
  // ISO instants of timestamp tokens in the step
  timestamps: string[];
};

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);
const ITEM_TYPES = new Set(['listItem', 'taskItem']);

// Time and temperature amounts in a step describe how it is run rather than what is consumed.
export function stepConditions(quantities: Quantity[]): StepConditions {
  const byDimension = (dimension: string) => quantities.find((quantity) => findUnit(quantity.unit)?.dimension === dimension) ?? null;
  return { duration: byDimension('time'), temperature: byDimension('temperature') };
}

export function describeConditions(conditions: StepConditions): string {
  return [conditions.duration, conditions.temperature]
    .filter((quantity): quantity is Quantity => quantity !== null)
    .map(formatQuantity)
    .join(' · ');
}

function stepText(node: ProseMirrorNode): string {
  let text = '';
  node.descendants((child) => {
    // Sub-steps are separate blocks; without this their text runs into the line above.
    if (child.isTextblock && text.length > 0) {
      text += ' ';
    }
    if (child.isText) {
      text += child.text ?? '';
    } else if (child.type.name === 'entityMention') {
      text += String(child.attrs.label ?? '');
    } else if (child.type.name === 'quantity') {
      text += `${child.attrs.value} ${child.attrs.unit}`;
    }
    return true;
  });
  return text.replace(/\s+/g, ' ').trim();
}

// Top-level list items, in document order. A nested list is part of the step it hangs under
// rather than a step of its own, so its items are not counted twice.
export function collectSteps(doc: ProseMirrorNode): ProtocolStep[] {
  const steps: ProtocolStep[] = [];

  doc.forEach((list, listOffset) => {
    if (!LIST_TYPES.has(list.type.name)) {
      return;
    }

    const ordered = list.type.name === 'orderedList';

    list.forEach((item, itemOffset) => {
      if (!ITEM_TYPES.has(item.type.name)) {
        return;
      }

      const quantities: Quantity[] = [];
      const timestamps: string[] = [];
      item.descendants((child) => {
        if (child.type.name === 'quantity') {
          quantities.push({ value: Number(child.attrs.value), unit: String(child.attrs.unit) });
        } else if (child.type.name === 'timestamp' && child.attrs.at) {
          timestamps.push(String(child.attrs.at));
        }
        return true;
      });

      const pos = listOffset + 1 + itemOffset;
      steps.push({
        index: steps.length + 1,
        pos,
        textPos: pos + (item.firstChild?.isTextblock ? 2 : 1),
        text: stepText(item),
        ordered,
        done: item.attrs.checked === true,
        conditions: stepConditions(quantities),
        timestamps
      });
    });
  });

  return steps;
}
