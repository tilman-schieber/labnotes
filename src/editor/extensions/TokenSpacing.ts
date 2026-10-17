import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// Keeps sentences with tokens reading like sentences. Accepting a reference or a quantity
// leaves a space after the token; writers then type a space anyway, or type the comma or full
// stop that belongs right after the token. Both land here: a second space is swallowed, and
// punctuation typed after that space replaces it.

const TOKEN_TYPES = new Set(['entityMention', 'userMention', 'quantity', 'timestamp']);
const PUNCTUATION = /^[.,;:!?)\]]$/;

export const tokenSpacingKey = new PluginKey('tokenSpacing');

// The text node holding the single space right before `pos`, when the node before that space is
// a token: returns the space's position, else null.
function spaceAfterToken(doc: ProseMirrorNode, pos: number): number | null {
  const $pos = doc.resolve(pos);
  const before = $pos.nodeBefore;
  if (!before?.isText || before.text !== ' ') {
    return null;
  }
  const $space = doc.resolve(pos - 1);
  const token = $space.nodeBefore;
  return token && TOKEN_TYPES.has(token.type.name) ? pos - 1 : null;
}

export function tokenSpacingDecision(doc: ProseMirrorNode, pos: number, text: string): 'swallow' | 'replace' | null {
  const space = spaceAfterToken(doc, pos);
  if (space === null) {
    return null;
  }
  if (text === ' ') {
    return 'swallow';
  }
  if (PUNCTUATION.test(text)) {
    return 'replace';
  }
  return null;
}

export const TokenSpacing = Extension.create({
  name: 'tokenSpacing',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tokenSpacingKey,
        props: {
          handleTextInput: (view, from, to, text) => {
            if (from !== to) {
              return false;
            }
            const decision = tokenSpacingDecision(view.state.doc, from, text);
            if (decision === 'swallow') {
              return true;
            }
            if (decision === 'replace') {
              view.dispatch(view.state.tr.insertText(text, from - 1, from));
              return true;
            }
            return false;
          }
        }
      })
    ];
  }
});
