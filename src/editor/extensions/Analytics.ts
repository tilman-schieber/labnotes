import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createAnalyticsEntry, type AnalyticsEntry } from '../../chemistry/analytics';
import AnalyticsBlockView from '../AnalyticsBlockView';

export type AnalyticsAttrs = {
  // The batch these data describe (a product registered from a reaction table), if any.
  batchId: string | null;
  batchCode: string | null;
  entries: AnalyticsEntry[];
};

export type AnalyticsOptions = {
  documentId: string | null;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    analytics: {
      insertAnalytics: (attrs?: Partial<AnalyticsAttrs>, position?: number) => ReturnType;
    };
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Block of analytical data (TLC, NMR, MS, …) on a product batch. Part of the signed document; the
// server mirrors it onto the batch entity on save.
export const AnalyticsNode = Node.create<AnalyticsOptions>({
  name: 'analytics',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { documentId: null };
  },

  addAttributes() {
    return {
      batchId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-batch-id') || null,
        renderHTML: (attributes) => (attributes.batchId ? { 'data-batch-id': attributes.batchId } : {})
      },
      batchCode: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-batch-code') || null,
        renderHTML: (attributes) => (attributes.batchCode ? { 'data-batch-code': attributes.batchCode } : {})
      },
      entries: {
        default: [],
        parseHTML: (element) => parseJson<AnalyticsEntry[]>(element.getAttribute('data-entries'), []),
        renderHTML: (attributes) => ({ 'data-entries': JSON.stringify(attributes.entries ?? []) })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="analytics"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as AnalyticsAttrs;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'analytics', class: 'analytics-block' }), attrs.batchCode ? `Analytics · ${attrs.batchCode}` : 'Analytics'];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnalyticsBlockView);
  },

  addCommands() {
    return {
      insertAnalytics:
        (attrs = {}, position) =>
        ({ commands }) => {
          const content = {
            type: this.name,
            attrs: { batchId: null, batchCode: null, entries: [createAnalyticsEntry('TLC')], ...attrs } satisfies AnalyticsAttrs
          };
          return position === undefined ? commands.insertContent(content) : commands.insertContentAt(position, content);
        }
    };
  }
});
