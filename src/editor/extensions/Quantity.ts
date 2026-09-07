import { InputRule, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { conversionsFor, findUnit, formatQuantity, parseQuantity } from '../../units/quantity';
import { QUANTITY_INPUT_REGEX, quantityInputMatch } from '../recognition/quantities';
import { promptDialog } from '../../ui/dialogs';

type QuantityAttrs = {
  value: number;
  unit: string;
};

function tooltipFor(attrs: QuantityAttrs): string {
  const conversions = conversionsFor(attrs).map(formatQuantity);
  const dimension = findUnit(attrs.unit)?.dimension ?? 'quantity';
  return [dimension, ...conversions].join(' · ');
}

// Edit dialog for the token at `position`; used by double-click and by Enter on a selected token.
function editQuantity(editor: Editor, position: number): void {
  const node = editor.state.doc.nodeAt(position);
  if (!node || node.type.name !== 'quantity') {
    return;
  }
  const current = formatQuantity(node.attrs as QuantityAttrs);
  void promptDialog({
    title: 'Edit quantity',
    label: 'Value and unit',
    defaultValue: current,
    confirmLabel: 'Apply',
    message: 'Anything that is not a quantity becomes plain text.'
  }).then((next) => {
    if (next === null) {
      editor.commands.focus();
      return;
    }
    const parsed = parseQuantity(next);
    if (!parsed) {
      // Not a quantity any more: turn it back into plain text.
      editor.view.dispatch(editor.state.tr.replaceWith(position, position + node.nodeSize, editor.schema.text(next)));
    } else {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, parsed));
    }
    editor.commands.focus(position + 1);
  });
}

// Inline atom for a value with a unit, e.g. "12.5 mL". Created by typing a quantity followed by
// a space; Backspace right after undoes the conversion (standard input-rule behaviour).
export const QuantityNode = Node.create({
  name: 'quantity',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute('data-value') ?? 0)
      },
      unit: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-unit') ?? ''
      }
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="quantity"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as QuantityAttrs;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'quantity',
        'data-value': String(attrs.value),
        'data-unit': attrs.unit,
        class: 'quantity-token'
      }),
      formatQuantity(attrs)
    ];
  },

  renderText({ node }) {
    return formatQuantity(node.attrs as QuantityAttrs);
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span');
      dom.className = 'quantity-token';
      dom.setAttribute('data-type', 'quantity');

      const apply = (attrs: QuantityAttrs) => {
        dom.textContent = formatQuantity(attrs);
        dom.title = tooltipFor(attrs);
        dom.setAttribute('data-value', String(attrs.value));
        dom.setAttribute('data-unit', attrs.unit);
      };
      apply(node.attrs as QuantityAttrs);

      dom.addEventListener('dblclick', (event) => {
        if (!editor.isEditable) {
          return;
        }
        event.preventDefault();
        const position = typeof getPos === 'function' ? getPos() : null;
        if (position !== null && position !== undefined) {
          editQuantity(editor, position);
        }
      });

      return {
        dom,
        update: (updated) => {
          if (updated.type !== node.type) {
            return false;
          }
          node = updated;
          apply(node.attrs as QuantityAttrs);
          return true;
        }
      };
    };
  },

  // Keyboard editing: select the token (arrow keys land on it as a node selection) and press Enter.
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type !== this.type) {
          return false;
        }
        editQuantity(this.editor, selection.from);
        return true;
      }
    };
  },

  addInputRules() {
    return [
      new InputRule({
        // A quantity followed by whitespace or the punctuation of "(10.0 mmol, 1.0 equiv)" and
        // "for 4 h." — the terminator stays as text after the token.
        find: QUANTITY_INPUT_REGEX,
        handler: ({ state, range, match }) => {
          const result = quantityInputMatch(match[0]);
          if (!result) {
            return null;
          }

          // `range` covers the leading whitespace (if any); keep it as text before the node.
          const from = range.from + result.start;
          state.tr.replaceWith(from, range.to, [this.type.create(result.quantity), state.schema.text(result.trailing)]);
          return undefined;
        }
      })
    ];
  }
});
