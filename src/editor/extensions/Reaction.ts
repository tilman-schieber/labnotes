import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createComponent, type ReactionComponent } from '../../chemistry/reaction';
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
      insertReaction:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: '',
              components: [createComponent('reactant'), createComponent('reactant'), createComponent('product')]
            } satisfies ReactionAttrs
          })
    };
  }
});
