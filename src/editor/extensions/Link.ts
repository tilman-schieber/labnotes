import { Mark, markInputRule, markPasteRule, mergeAttributes } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

const MARKDOWN_LINK_INPUT_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)$/;
const MARKDOWN_LINK_PASTE_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const URL_PASTE_REGEX = /^(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)$/i;
const URL_TEXT_PASTE_REGEX = /(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/gi;

function normalizeHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (!href) {
    return null;
  }

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  return `https://${href}`;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    link: {
      setLink: (attributes: { href: string }) => ReturnType;
      unsetLink: () => ReturnType;
    };
  }
}

export const LinkExtension = Mark.create({
  name: 'link',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute('href'),
        renderHTML: (attributes) => {
          if (!attributes.href) {
            return {};
          }

          return { href: attributes.href };
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: 'a[href]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(
        { rel: 'noopener noreferrer nofollow', target: '_blank' },
        HTMLAttributes
      ),
      0
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: MARKDOWN_LINK_INPUT_REGEX,
        type: this.type,
        getAttributes: (match) => ({ href: normalizeHref(match[2] ?? '') })
      })
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: MARKDOWN_LINK_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => ({ href: normalizeHref(match[2] ?? '') })
      }),
      markPasteRule({
        find: URL_TEXT_PASTE_REGEX,
        type: this.type,
        getAttributes: (match) => ({ href: normalizeHref(typeof match[0] === 'string' ? match[0] : '') })
      })
    ];
  },

  addCommands() {
    return {
      setLink:
        (attributes) =>
        ({ chain }) => {
          const href = normalizeHref(attributes.href ?? '');
          if (!href) {
            return false;
          }

          return chain().setMark(this.name, { href }).run();
        },
      unsetLink:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run()
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const pastedText = event.clipboardData?.getData('text/plain')?.trim() ?? '';
            if (!URL_PASTE_REGEX.test(pastedText)) {
              return false;
            }

            const href = normalizeHref(pastedText);
            if (!href) {
              return false;
            }

            const { from, to, empty } = view.state.selection;
            const linkMark = this.type.create({ href });
            const tr = view.state.tr;

            if (empty) {
              tr.insertText(pastedText, from, to);
              tr.addMark(from, from + pastedText.length, linkMark);
            } else {
              tr.addMark(from, to, linkMark);
            }

            view.dispatch(tr);
            return true;
          }
        }
      })
    ];
  }
});
