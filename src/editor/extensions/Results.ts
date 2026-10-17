import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ResultsAttrs, ResultsColumn, ResultsRow } from '../../chemistry/results';
import ResultsView from '../ResultsView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    results: {
      insertResults: () => ReturnType;
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

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function createResults(): ResultsAttrs {
  return { title: '', columns: [{ id: newId(), label: '', unit: '' }], rows: [{ id: newId(), entityId: null, entityType: null, label: '', values: {}, note: '' }] };
}

// Block-level results table: rows are samples (registry entities when matched), columns are
// measures with a unit. Every numeric cell of a matched row is a result on that entity.
export const ResultsNode = Node.create({
  name: 'results',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? ''
      },
      columns: {
        default: [],
        parseHTML: (element) => parseJson<ResultsColumn[]>(element.getAttribute('data-columns'), []),
        renderHTML: (attributes) => ({ 'data-columns': JSON.stringify(attributes.columns ?? []) })
      },
      rows: {
        default: [],
        parseHTML: (element) => parseJson<ResultsRow[]>(element.getAttribute('data-rows'), []),
        renderHTML: (attributes) => ({ 'data-rows': JSON.stringify(attributes.rows ?? []) })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="results"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ResultsAttrs;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'results', 'data-title': attrs.title, class: 'results-block' }), attrs.title || 'Results'];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResultsView);
  },

  addCommands() {
    return {
      insertResults:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: createResults() })
    };
  }
});
