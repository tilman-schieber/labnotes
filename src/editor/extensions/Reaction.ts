import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createComponent, type ReactionComponent } from '../../chemistry/reaction';
import { componentsFromBlocks, sectionBlocksBefore } from '../../chemistry/reactionFromText';
import ReactionBlockView from '../ReactionBlockView';

export type ReactionAttrs = {
  title: string;
  components: ReactionComponent[];
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reaction: {
      insertReaction: () => ReturnType;
    };
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
export const ReactionNode = Node.create({
  name: 'reaction',
  group: 'block',
  atom: true,
  draggable: true,

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
          const fromText = componentsFromBlocks(sectionBlocksBefore(blocks, blockIndex));
          const components =
            fromText.length > 0
              ? fromText.some((component) => component.role === 'product')
                ? fromText
                : [...fromText, createComponent('product')]
              : [createComponent('reactant'), createComponent('reactant'), createComponent('product')];

          return commands.insertContent({
            type: this.name,
            attrs: { title: '', components } satisfies ReactionAttrs
          });
        }
    };
  }
});
