import Document from '@tiptap/extension-document';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { NotebookDocumentKind } from '../../documents/templates';
import { normalizeTemplateDocument } from '../../documents/templates';

export const NotebookDocument = Document.extend({
  content: 'heading block*'
});

export const NotebookDocumentStructure = Extension.create<{ kind: NotebookDocumentKind }>({
  name: 'notebookDocumentStructure',

  addOptions() {
    return {
      kind: 'experiment' as NotebookDocumentKind
    };
  },

  // The title is one line: Enter in it moves on to the body as a paragraph instead of splitting
  // the heading in two.
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $from } = this.editor.state.selection;
        if ($from.depth === 0 || $from.index(0) !== 0 || $from.parent.type.name !== 'heading') {
          return false;
        }
        return this.editor.chain().splitBlock().setParagraph().run();
      }
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const currentJSON = newState.doc.toJSON();
          const normalizedJSON = normalizeTemplateDocument(this.options.kind, currentJSON);
          if (JSON.stringify(currentJSON) === JSON.stringify(normalizedJSON)) {
            return null;
          }

          const normalizedDoc = newState.schema.nodeFromJSON(normalizedJSON);
          return newState.tr.replaceWith(0, newState.doc.content.size, normalizedDoc.content);
        }
      })
    ];
  }
});

// Shown in the first paragraph of an experiment that has no text yet.
export const BODY_PLACEHOLDER = 'What did you do? e.g. Add 25 mg of #Compound X to 2 mL of #Buffer and stir for 10 min. Type / for blocks.';

export const NotebookTitlePlaceholder = Extension.create<{ kind: NotebookDocumentKind }>({
  name: 'notebookTitlePlaceholder',

  addOptions() {
    return { kind: 'experiment' as NotebookDocumentKind };
  },

  addProseMirrorPlugins() {
    const kind = this.options.kind;
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const firstNode = state.doc.firstChild;
            const headingType = state.schema.nodes.heading;
            if (!firstNode || !headingType) {
              return null;
            }

            const decorations: Decoration[] = [];
            const isH1 = firstNode.type === headingType && Number(firstNode.attrs.level) === 1;
            if (isH1 && firstNode.textContent.trim().length === 0) {
              decorations.push(Decoration.node(0, firstNode.nodeSize, { class: 'is-empty', 'data-placeholder': 'enter title' }));
            }

            // Only while the body is a single empty paragraph: once anything is written the
            // hint is gone for good.
            const body = state.doc.maybeChild(1);
            if (kind === 'experiment' && state.doc.childCount === 2 && body && body.type.name === 'paragraph' && body.content.size === 0) {
              decorations.push(Decoration.node(firstNode.nodeSize, firstNode.nodeSize + body.nodeSize, { class: 'is-empty', 'data-placeholder': BODY_PLACEHOLDER }));
            }

            return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
          }
        }
      })
    ];
  }
});
