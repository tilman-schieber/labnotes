import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Keeps an empty paragraph after the last block so there is always somewhere to type after
// an atom block (reaction table, image, block math). Notion-style.
export const TrailingParagraph = Extension.create({
  name: 'trailingParagraph',

  addProseMirrorPlugins() {
    const key = new PluginKey('trailingParagraph');

    return [
      new Plugin({
        key,
        appendTransaction: (_transactions, _oldState, newState) => {
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
