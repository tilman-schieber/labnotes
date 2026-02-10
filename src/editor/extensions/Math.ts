import { mergeAttributes, nodeInputRule, nodePasteRule, Node } from '@tiptap/core';
import { renderMathIntoElement } from './mathRendering';
import { Plugin } from '@tiptap/pm/state';

const INLINE_MATH_INPUT_REGEX = /(?<!\$)\$([^$\n]+)\$(?!\$)$/;
const INLINE_MATH_PASTE_REGEX = /(?<!\$)\$([^$\n]+)\$(?!\$)/g;
const BLOCK_MATH_INPUT_REGEX = /\$\$([\s\S]+?)\$\$$/;
const BLOCK_MATH_PASTE_REGEX = /\$\$([\s\S]+?)\$\$/g;

export function sanitizeLatex(raw: string): string {
  let value = raw.trim();

  // Remove markdown-style wrappers repeatedly, e.g. `$x$`, `$$x$$`, `$$$x$$$`.
  while (value.length >= 2 && value.startsWith('$') && value.endsWith('$')) {
    value = value.slice(1, -1).trim();
  }

  // Also accept MathJax wrappers if users paste/type them manually.
  if (value.startsWith('\\(') && value.endsWith('\\)') && value.length >= 4) {
    value = value.slice(2, -2).trim();
  }
  if (value.startsWith('\\[') && value.endsWith('\\]') && value.length >= 4) {
    value = value.slice(2, -2).trim();
  }

  return value;
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({ 'data-latex': attributes.latex })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' })];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INLINE_MATH_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ latex: sanitizeLatex(match[1] ?? '') })
      })
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: INLINE_MATH_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => ({ latex: sanitizeLatex(match[1] ?? '') })
      })
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.className = 'math-node math-inline';

      let currentLatex = sanitizeLatex(node.attrs.latex ?? '');
      let currentAttrs = { ...node.attrs };
      let isEditing = false;

      const display = document.createElement('span');
      display.className = 'math-display';

      const input = document.createElement('input');
      input.className = 'math-edit-input';
      input.type = 'text';
      input.spellcheck = false;
      input.style.display = 'none';
      dom.append(display, input);

      const writeLatex = (latex: string) => {
        const position = typeof getPos === 'function' ? getPos() : getPos;
        if (typeof position !== 'number') {
          return;
        }

        const tr = editor.state.tr.setNodeMarkup(position, undefined, {
          ...currentAttrs,
          latex
        });
        editor.view.dispatch(tr);
      };

      const showRendered = () => {
        dom.classList.remove('is-editing');
        input.style.display = 'none';
        display.style.display = 'inline-block';
        void renderMathIntoElement(display, currentLatex, false);
      };

      const showEditor = () => {
        isEditing = true;
        dom.classList.add('is-editing');
        display.style.display = 'none';
        input.style.display = 'inline-block';
        input.value = currentLatex;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };

      const commit = () => {
        currentLatex = sanitizeLatex(input.value);
        writeLatex(currentLatex);
      };

      const closeEditor = (save: boolean) => {
        if (!isEditing) {
          return;
        }
        isEditing = false;
        if (save) {
          commit();
        }
        showRendered();
      };

      dom.addEventListener('mousedown', (event) => {
        if (event.target === input) {
          return;
        }
        event.preventDefault();
        if (!isEditing) {
          showEditor();
        }
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          closeEditor(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          input.value = currentLatex;
          closeEditor(false);
        }
      });

      input.addEventListener('blur', () => closeEditor(true));
      showRendered();
      if (!currentLatex) {
        queueMicrotask(() => {
          if (document.body.contains(dom)) {
            showEditor();
            input.select();
          }
        });
      }

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false;
          }

          currentAttrs = { ...updatedNode.attrs };
          currentLatex = sanitizeLatex(updatedNode.attrs.latex ?? '');
          if (isEditing) {
            input.value = currentLatex;
          } else {
            showRendered();
          }
          return true;
        }
      };
    };
  }

  ,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          let tr = newState.tr;
          let changed = false;
          const removals: Array<{ from: number; to: number }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) {
              return;
            }

            const from = pos;
            const to = pos + node.nodeSize;
            const before = from > 0 ? newState.doc.textBetween(from - 1, from, '\n', '\0') : '';
            const after = to < newState.doc.content.size ? newState.doc.textBetween(to, to + 1, '\n', '\0') : '';

            if (before === '$') {
              removals.push({ from: from - 1, to: from });
            }
            if (after === '$') {
              removals.push({ from: to, to: to + 1 });
            }
          });

          removals
            .sort((a, b) => b.from - a.from)
            .forEach((range) => {
              tr = tr.delete(range.from, range.to);
              changed = true;
            });

          return changed ? tr : null;
        }
      })
    ];
  }
});

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  code: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({ 'data-latex': attributes.latex })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' })];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: BLOCK_MATH_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ latex: sanitizeLatex(match[1] ?? '') })
      })
    ];
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: BLOCK_MATH_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => ({ latex: sanitizeLatex(match[1] ?? '') })
      })
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'math-node math-block';

      let currentLatex = sanitizeLatex(node.attrs.latex ?? '');
      let currentAttrs = { ...node.attrs };
      let isEditing = false;

      const display = document.createElement('div');
      display.className = 'math-display';

      const textarea = document.createElement('textarea');
      textarea.className = 'math-edit-input math-edit-textarea';
      textarea.spellcheck = false;
      textarea.style.display = 'none';
      textarea.rows = 3;
      dom.append(display, textarea);

      const writeLatex = (latex: string) => {
        const position = typeof getPos === 'function' ? getPos() : getPos;
        if (typeof position !== 'number') {
          return;
        }

        const tr = editor.state.tr.setNodeMarkup(position, undefined, {
          ...currentAttrs,
          latex
        });
        editor.view.dispatch(tr);
      };

      const showRendered = () => {
        dom.classList.remove('is-editing');
        textarea.style.display = 'none';
        display.style.display = 'block';
        void renderMathIntoElement(display, currentLatex, true);
      };

      const showEditor = () => {
        isEditing = true;
        dom.classList.add('is-editing');
        display.style.display = 'none';
        textarea.style.display = 'block';
        textarea.value = currentLatex;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      };

      const commit = () => {
        currentLatex = sanitizeLatex(textarea.value);
        writeLatex(currentLatex);
      };

      const closeEditor = (save: boolean) => {
        if (!isEditing) {
          return;
        }
        isEditing = false;
        if (save) {
          commit();
        }
        showRendered();
      };

      dom.addEventListener('mousedown', (event) => {
        if (event.target === textarea) {
          return;
        }
        event.preventDefault();
        if (!isEditing) {
          showEditor();
        }
      });

      textarea.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          closeEditor(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          textarea.value = currentLatex;
          closeEditor(false);
        }
      });

      textarea.addEventListener('blur', () => closeEditor(true));
      showRendered();
      if (!currentLatex) {
        queueMicrotask(() => {
          if (document.body.contains(dom)) {
            showEditor();
            textarea.select();
          }
        });
      }

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false;
          }

          currentAttrs = { ...updatedNode.attrs };
          currentLatex = sanitizeLatex(updatedNode.attrs.latex ?? '');
          if (isEditing) {
            textarea.value = currentLatex;
          } else {
            showRendered();
          }
          return true;
        }
      };
    };
  }
});
