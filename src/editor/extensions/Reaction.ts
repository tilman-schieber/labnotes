import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { extractConditions, type ReactionConditions } from '../../chemistry/conditions';
import { createComponent, type ReactionComponent } from '../../chemistry/reaction';
import { componentsFromBlocks, sectionBlocksBefore } from '../../chemistry/reactionFromText';
import ReactionBlockView from '../ReactionBlockView';

export type ReactionAttrs = {
  title: string;
  components: ReactionComponent[];
  // How the reaction was run, read from the section above and editable in the block.
  conditions: ReactionConditions | null;
  // Reaction SMILES drawn by hand; null means "derive it from the rows".
  scheme: string | null;
  // Table folded away: scheme, conditions and the summary line stay visible.
  collapsed: boolean;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reaction: {
      insertReaction: () => ReturnType;
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

function parseComponents(raw: string | null): ReactionComponent[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReactionComponent[]) : [];
  } catch {
    return [];
  }
}

// Block-level reaction table. Components reference registry compounds by entity id so the
// mention index treats them as references; stoichiometry is computed on render.
export type ReactionOptions = {
  // The document being edited; registering a batch from a product row needs it.
  documentId: string | null;
};

export const ReactionNode = Node.create<ReactionOptions>({
  name: 'reaction',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { documentId: null };
  },

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? ''
      },
      components: {
        default: [],
        parseHTML: (element) => parseComponents(element.getAttribute('data-components')),
        renderHTML: (attributes) => ({ 'data-components': JSON.stringify(attributes.components ?? []) })
      },
      conditions: {
        default: null,
        parseHTML: (element) => parseJson<ReactionConditions | null>(element.getAttribute('data-conditions'), null),
        renderHTML: (attributes) => (attributes.conditions ? { 'data-conditions': JSON.stringify(attributes.conditions) } : {})
      },
      scheme: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-scheme') || null,
        renderHTML: (attributes) => (attributes.scheme ? { 'data-scheme': attributes.scheme } : {})
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => (attributes.collapsed ? { 'data-collapsed': 'true' } : {})
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="reaction"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ReactionAttrs;
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'reaction', 'data-title': attrs.title, class: 'reaction-block' }),
      attrs.title || 'Reaction'
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReactionBlockView);
  },

  addCommands() {
    return {
      // Pre-fills from the prose of the current section (since the last heading) so the table
      // is a view of what was written, not a second data-entry form.
      insertReaction:
        () =>
        ({ commands, state }) => {
          const blocks = state.doc.toJSON().content ?? [];
          const $from = state.selection.$from;
          const blockIndex = $from.depth > 0 ? $from.index(0) : blocks.length;
          const section = sectionBlocksBefore(blocks, blockIndex);
          const fromText = componentsFromBlocks(section);
          const conditions = extractConditions(section);
          const components =
            fromText.length > 0
              ? fromText.some((component) => component.role === 'product')
                ? fromText
                : [...fromText, createComponent('product')]
              : [createComponent('reactant'), createComponent('reactant'), createComponent('product')];

          return commands.insertContent({
            type: this.name,
            attrs: { title: '', components, conditions, scheme: null, collapsed: false } satisfies ReactionAttrs
          });
        }
    };
  }
});
