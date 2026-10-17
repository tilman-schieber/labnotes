import { InputRule, Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

// A fill-in blank in a template: "[[strain]]" becomes a dashed token that Tab jumps to and that
// typing replaces. A template is its blanks plus its planned amounts; an instance of it is
// finished when no blank is left.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blank: {
      insertBlank: (label?: string) => ReturnType;
      jumpToBlank: (direction?: 1 | -1) => ReturnType;
    };
  }
}

export type BlankAttrs = { label: string };

// Positions of every blank in document order.
export function blankPositions(doc: import('@tiptap/pm/model').Node): number[] {
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'blank') {
      positions.push(pos);
    }
  });
  return positions;
}

// A picker or the unit list may be waiting for Tab; leave it to them.
function pickerInProgress(state: import('@tiptap/pm/state').EditorState): boolean {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock) {
    return false;
  }
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', ' ');
  return /[#@][^\s#@]*$/.test(before) || /(?:^|[\s(])-?\d+(?:[.,]\d+)?[ ]?[\p{L}µ°%]*$/u.test(before);
}

export const BlankNode = Node.create({
  name: 'blank',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  // Above the list and suggestion keymaps so Tab reaches a blank in a protocol list too.
  priority: 1000,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? ''
      }
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="blank"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as BlankAttrs;
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'blank', 'data-label': attrs.label, class: 'blank-token', title: 'Fill in: type to replace, Tab to jump to the next blank' }), attrs.label || '…'];
  },

  renderText({ node }) {
    return `[${(node.attrs as BlankAttrs).label || '…'}]`;
  },

  addCommands() {
    return {
      insertBlank:
        (label = '') =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs: { label } }, { type: 'text', text: ' ' }]),
      jumpToBlank:
        (direction = 1) =>
        ({ state, tr, dispatch }) => {
          const positions = blankPositions(state.doc);
          if (positions.length === 0) {
            return false;
          }
          const { from, to } = state.selection;
          const forward = positions.filter((pos) => pos >= to);
          const backward = positions.filter((pos) => pos < from);
          const target = direction === 1 ? (forward[0] ?? positions[0]) : (backward[backward.length - 1] ?? positions[positions.length - 1]);
          if (dispatch) {
            tr.setSelection(NodeSelection.create(tr.doc, target)).scrollIntoView();
          }
          return true;
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => (pickerInProgress(this.editor.state) ? false : this.editor.commands.jumpToBlank(1)),
      'Shift-Tab': () => (pickerInProgress(this.editor.state) ? false : this.editor.commands.jumpToBlank(-1))
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]{1,60})\]\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ label: match[1].trim() }));
        }
      })
    ];
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey('blankFill'),
        props: {
          // Typing on a selected blank replaces it; the caret lands after what was typed, so a
          // "#" goes on to open the picker as usual.
          handleTextInput: (view, _from, _to, text) => {
            const { selection } = view.state;
            if (!(selection instanceof NodeSelection) || selection.node.type !== type) {
              return false;
            }
            const tr = view.state.tr.replaceSelectionWith(view.state.schema.text(text), false);
            tr.setSelection(TextSelection.create(tr.doc, selection.from + text.length)).scrollIntoView();
            view.dispatch(tr);
            return true;
          }
        }
      })
    ];
  }
});
