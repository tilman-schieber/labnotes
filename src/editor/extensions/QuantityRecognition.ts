import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findQuantities, type QuantityMatch } from '../recognition/quantities';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    quantityRecognition: {
      // Turns the plain-text amount at `from`..`to` into a quantity token.
      convertQuantity: (from: number, to: number) => ReturnType;
      convertAllQuantities: () => ReturnType;
    };
  }
}

export const quantityRecognitionKey = new PluginKey<QuantityRecognitionState>('quantityRecognition');

export type QuantityHit = QuantityMatch & { from: number; to: number };
type QuantityRecognitionState = { decorations: DecorationSet; hits: QuantityHit[] };

function scan(doc: ProseMirrorNode): QuantityHit[] {
  const hits: QuantityHit[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }
    for (const match of findQuantities(node.text)) {
      hits.push({ ...match, from: pos + match.start, to: pos + match.end });
    }
  });
  return hits;
}

function build(state: EditorState): QuantityRecognitionState {
  const hits = scan(state.doc);
  const decorations = DecorationSet.create(
    state.doc,
    hits.map((hit) => Decoration.inline(hit.from, hit.to, { class: 'quantity-hint', title: 'Amount written as text — click to make it a quantity token' }))
  );
  return { decorations, hits };
}

// Underlines amounts typed (or pasted) as plain text. Advisory, like entity recognition: nothing
// changes until the writer clicks or runs the command.
export const QuantityRecognition = Extension.create({
  name: 'quantityRecognition',

  addStorage() {
    return { count: 0 };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin<QuantityRecognitionState>({
        key: quantityRecognitionKey,
        state: {
          init: (_config, state) => {
            const next = build(state);
            extension.storage.count = next.hits.length;
            return next;
          },
          apply: (tr: Transaction, previous, _old, state) => {
            if (!tr.docChanged) {
              return previous;
            }
            const next = build(state);
            extension.storage.count = next.hits.length;
            return next;
          }
        },
        props: {
          decorations: (state) => quantityRecognitionKey.getState(state)?.decorations ?? null,
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.classList.contains('quantity-hint')) {
              return false;
            }
            const hit = quantityRecognitionKey.getState(view.state)?.hits.find((item) => item.from <= pos && pos <= item.to);
            if (!hit) {
              return false;
            }
            extension.editor.commands.convertQuantity(hit.from, hit.to);
            return true;
          }
        }
      })
    ];
  },

  addCommands() {
    return {
      convertQuantity:
        (from, to) =>
        ({ state, tr, dispatch }) => {
          const hit = quantityRecognitionKey.getState(state)?.hits.find((item) => item.from === from && item.to === to);
          if (!hit) {
            return false;
          }
          if (dispatch) {
            tr.replaceWith(from, to, state.schema.nodes.quantity.create(hit.quantity));
          }
          return true;
        },
      convertAllQuantities:
        () =>
        ({ state, tr, dispatch }) => {
          const hits = quantityRecognitionKey.getState(state)?.hits ?? [];
          if (hits.length === 0) {
            return false;
          }
          if (dispatch) {
            // Replace from the end so earlier positions stay valid.
            [...hits]
              .sort((left, right) => right.from - left.from)
              .forEach((hit) => tr.replaceWith(hit.from, hit.to, state.schema.nodes.quantity.create(hit.quantity)));
          }
          return true;
        }
    };
  }
});
