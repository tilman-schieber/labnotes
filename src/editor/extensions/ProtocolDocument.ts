import Document from '@tiptap/extension-document';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { NotebookDocumentKind } from '../../documents/templates';
import { normalizeTemplateDocument } from '../../documents/templates';

export const ProtocolDocument = Document.extend({
  content: 'heading block*'
});

export const ProtocolDocumentStructure = Extension.create<{ kind: NotebookDocumentKind }>({
  name: 'protocolDocumentStructure',

  addOptions() {
    return {
      kind: 'protocol' as NotebookDocumentKind
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

export const ProtocolTitlePlaceholder = Extension.create({
  name: 'protocolTitlePlaceholder',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const firstNode = state.doc.firstChild;
            const headingType = state.schema.nodes.heading;
            if (!firstNode || !headingType) {
              return null;
            }

            const isH1 = firstNode.type === headingType && Number(firstNode.attrs.level) === 1;
            const isEmpty = firstNode.textContent.trim().length === 0;
            if (!isH1 || !isEmpty) {
              return null;
            }

            return DecorationSet.create(state.doc, [
              Decoration.node(0, firstNode.nodeSize, {
                class: 'is-empty',
                'data-placeholder': 'enter title'
              })
            ]);
          }
        }
      })
    ];
  }
});
