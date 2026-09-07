import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { NotebookDocumentKind } from '../../documents/templates';
import { allowsFreeContent } from '../../documents/templates';

// Keeps an empty paragraph after the last block so there is always somewhere to type after
// an atom block (reaction table, image, block math). Notion-style.
export const TrailingParagraph = Extension.create<{ kind: NotebookDocumentKind }>({
  name: 'trailingParagraph',

  addOptions() {
    return {
      kind: 'experiment' as NotebookDocumentKind
    };
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('trailingParagraph');
    // Group and project pages are normalized back to their h1 on every change, so appending
    // here would be undone and re-appended forever.
    const enabled = allowsFreeContent(this.options.kind);

    return [
      new Plugin({
        key,
        appendTransaction: (_transactions, _oldState, newState) => {
          if (!enabled) {
            return null;
          }

          const { doc, schema } = newState;
          const last = doc.lastChild;
          if (last && last.type === schema.nodes.paragraph && last.childCount === 0) {
            return null;
          }
          return newState.tr.insert(doc.content.size, schema.nodes.paragraph.create());
        }
      })
    ];
  }
});
