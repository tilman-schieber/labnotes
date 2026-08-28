import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createSuggestionRenderer, type SuggestionOption } from './Mention';

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Block-level commands reachable from the keyboard: type "/" at the start of a word.
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'time',
    label: 'Timestamp',
    description: 'Current time, e.g. 14:32 (Ctrl/Cmd+Shift+T)',
    keywords: ['time', 'now', 'clock'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertTimestamp().run()
  },
  {
    id: 'date',
    label: 'Date',
    description: "Today's date as text",
    keywords: ['date', 'today'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent(`${todayIso()} `).run()
  },
  {
    id: 'heading',
    label: 'Heading',
    description: 'Section heading',
    keywords: ['heading', 'h2', 'title', 'section'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
  },
  {
    id: 'subheading',
    label: 'Subheading',
    description: 'Smaller heading',
    keywords: ['subheading', 'h3'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
  },
  {
    id: 'bullets',
    label: 'Bullet list',
    description: 'Unordered list',
    keywords: ['bullet', 'list', 'ul'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    description: 'Ordered steps',
    keywords: ['numbered', 'ordered', 'steps', 'ol'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
  },
  {
    id: 'tasks',
    label: 'Task list',
    description: 'Checkboxes',
    keywords: ['task', 'todo', 'checkbox'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
  },
  {
    id: 'table',
    label: 'Table',
    description: '3 × 3 with a header row',
    keywords: ['table', 'grid'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    id: 'reaction',
    label: 'Reaction',
    description: 'Stoichiometry table (pre-filled from the text above)',
    keywords: ['reaction', 'stoichiometry', 'yield'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertReaction().run()
  },
  {
    id: 'formula',
    label: 'Formula',
    description: 'Display math (LaTeX, mhchem)',
    keywords: ['formula', 'math', 'latex', 'equation', 'ce'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).insertContent({ type: 'blockMath', attrs: { latex: '' } }).run()
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Block quote',
    keywords: ['quote', 'blockquote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal rule',
    keywords: ['divider', 'rule', 'hr', 'line'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
  }
];

function matches(command: SlashCommand, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || command.label.toLowerCase().includes(needle) || command.keywords.some((keyword) => keyword.startsWith(needle));
}

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SuggestionOption & { run: SlashCommand['run'] }>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        startOfLine: false,
        items: ({ query }) =>
          SLASH_COMMANDS.filter((command) => matches(command, query)).map((command) => ({
            id: command.id,
            label: command.label,
            description: command.description,
            refType: 'entity' as const,
            run: command.run
          })),
        render: () => createSuggestionRenderer('/'),
        command: ({ editor, range, props }) => props.run(editor, range)
      })
    ];
  }
});
