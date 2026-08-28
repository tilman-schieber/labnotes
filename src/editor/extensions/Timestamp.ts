import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    timestamp: {
      insertTimestamp: (at?: Date) => ReturnType;
    };
  }
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const fullFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : timeFormatter.format(date);
}

// "14:32" inline marker for chronological notes. Stores the full instant; shows the time,
// with the date on hover. Mod-Shift-T or /time inserts one.
export const TimestampNode = Node.create({
  name: 'timestamp',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      at: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-at') ?? ''
      }
    };
  },

  parseHTML() {
    return [{ tag: 'time[data-type="timestamp"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const at = String(node.attrs.at);
    return [
      'time',
      mergeAttributes(HTMLAttributes, { 'data-type': 'timestamp', 'data-at': at, datetime: at, class: 'timestamp-token', title: fullFormatter.format(new Date(at)) }),
      formatTimestamp(at)
    ];
  },

  renderText({ node }) {
    return formatTimestamp(String(node.attrs.at));
  },

  addCommands() {
    return {
      insertTimestamp:
        (at = new Date()) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs: { at: at.toISOString() } }, { type: 'text', text: ' ' }])
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => this.editor.commands.insertTimestamp()
    };
  }
});
