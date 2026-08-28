import Mention from '@tiptap/extension-mention';
import { Extension, type Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createEntity, searchDocuments, searchEntities, searchUsers } from '../../api/backend';
import { compoundTokenNodeView } from './CompoundToken';

type SuggestionOption = {
  id: string;
  label: string;
  description?: string;
  refType: 'entity' | 'user';
  entityType?: string;
  // Set on the "Create ... as <type>" rows; the entity is created on selection.
  create?: boolean;
};

// Types offered by quick-create, in display order. 'document' is excluded: those are mirrored from the tree.
const QUICK_CREATE_TYPES = ['sample', 'specimen', 'reagent', 'compound', 'instrument', 'container', 'location'];

function buildQuickCreateOptions(query: string, existing: SuggestionOption[]): SuggestionOption[] {
  const label = query.trim();
  if (!label) {
    return [];
  }

  const hasExactMatch = existing.some((option) => option.label.trim().toLowerCase() === label.toLowerCase());
  if (hasExactMatch) {
    return [];
  }

  return QUICK_CREATE_TYPES.map((entityType) => ({
    id: '',
    label,
    description: `Create as ${entityType}`,
    refType: 'entity' as const,
    entityType,
    create: true
  }));
}

// Resolves a quick-create row into a real entity before the mention node is inserted.
async function resolveOption(option: SuggestionOption): Promise<SuggestionOption> {
  if (!option.create) {
    return option;
  }

  const entity = await createEntity(option.entityType ?? 'sample', option.label);
  return { ...option, id: entity.id, label: entity.label, create: false };
}

type SuggestionListState = {
  element: HTMLDivElement;
  selectedIndex: number;
  options: SuggestionOption[];
  command: (option: SuggestionOption) => void;
};

function positionElement(element: HTMLElement, editor: Editor): void {
  const { from } = editor.state.selection;
  const coords = editor.view.coordsAtPos(from);
  element.style.left = `${coords.left}px`;
  element.style.top = `${coords.bottom + 6}px`;
}

function createList(state: SuggestionListState): void {
  state.element.innerHTML = '';

  if (state.options.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mention-item mention-item-empty';
    empty.textContent = 'No matches';
    state.element.appendChild(empty);
    return;
  }

  state.options.forEach((option, index) => {
    const item = document.createElement('div');
    item.className = `mention-item${index === state.selectedIndex ? ' is-selected' : ''}${option.create ? ' mention-item-create' : ''}`;

    const label = document.createElement('div');
    label.className = 'mention-item-label';
    label.textContent = option.create ? `+ Create "${option.label}"` : option.label;

    const meta = document.createElement('div');
    meta.className = 'mention-item-meta';
    meta.textContent = option.description ?? option.refType;

    item.append(label, meta);
    item.onmousedown = (event) => {
      event.preventDefault();
      state.command(option);
    };
    state.element.appendChild(item);
  });
}

function selectOption(state: SuggestionListState): void {
  const option = state.options[state.selectedIndex];
  if (option) {
    state.command(option);
  }
}

function createSuggestionRenderer() {
  let state: SuggestionListState | null = null;

  return {
    onStart: (props: { items: SuggestionOption[]; command: (attrs: SuggestionOption) => void; editor: Editor }) => {
      const element = document.createElement('div');
      element.className = 'mention-list';
      element.style.position = 'absolute';
      element.style.zIndex = '1000';

      state = {
        element,
        selectedIndex: 0,
        options: props.items,
        command: (option) => void resolveOption(option).then(props.command)
      };

      createList(state);
      positionElement(element, props.editor);
      document.body.appendChild(element);
    },
    onUpdate: (props: { items: SuggestionOption[]; command: (attrs: SuggestionOption) => void; editor: Editor }) => {
      if (!state) {
        return;
      }

      state.options = props.items;
      state.command = (option) => void resolveOption(option).then(props.command);
      if (state.selectedIndex >= state.options.length) {
        state.selectedIndex = 0;
      }

      createList(state);
      positionElement(state.element, props.editor);
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (!state) {
        return false;
      }

      if (props.event.key === 'ArrowDown') {
        props.event.preventDefault();
        state.selectedIndex = (state.selectedIndex + 1) % Math.max(state.options.length, 1);
        createList(state);
        return true;
      }

      if (props.event.key === 'ArrowUp') {
        props.event.preventDefault();
        const max = Math.max(state.options.length, 1);
        state.selectedIndex = (state.selectedIndex - 1 + max) % max;
        createList(state);
        return true;
      }

      if (props.event.key === 'Enter') {
        props.event.preventDefault();
        selectOption(state);
        return true;
      }

      if (props.event.key === 'Escape') {
        props.event.preventDefault();
        state.element.remove();
        state = null;
        return true;
      }

      return false;
    },
    onExit: () => {
      if (!state) {
        return;
      }

      state.element.remove();
      state = null;
    }
  };
}

function makeReferenceLabel(prefix: string, node: { attrs: Record<string, unknown> }) {
  const label = typeof node.attrs.label === 'string' ? node.attrs.label : String(node.attrs.id ?? '');
  return `${prefix}${label}`;
}

// Document references are entity mentions too, but render with the hierarchy prefix.
function entityPrefix(node: { attrs: Record<string, unknown> }) {
  return node.attrs.entityType === 'document' ? '/' : '#';
}

const EntityMention = Mention.extend({
  name: 'entityMention',

  addAttributes() {
    return {
      ...this.parent?.(),
      label: { default: null },
      entityType: { default: 'entity' },
      refType: { default: 'entity' },
      // Compound tokens can show their structure inline; toggled by clicking the token.
      inlineStructure: { default: false }
    };
  },

  addNodeView() {
    return compoundTokenNodeView;
  }
});

// `documentId` is the document being edited; it scopes the "recently used here" ranking.
export function createEntityMentionExtension(documentId: string | null) {
  return EntityMention.configure({
    HTMLAttributes: {
      class: 'mention reference-token reference-entity'
    },
    suggestion: {
      char: '#',
      items: async ({ query }: { query: string }) => {
        const entities = await searchEntities(query, { documentId });
        const options = entities.map((entity) => ({
          id: entity.id,
          label: entity.label,
          description: entity.description,
          refType: 'entity' as const,
          entityType: entity.type
        }));
        return [...options, ...buildQuickCreateOptions(query, options)];
      },
      render: () => createSuggestionRenderer()
    },
    renderLabel({ node }) {
      return makeReferenceLabel(entityPrefix(node), node);
    }
  });
}

// `/` opens hierarchy-first document lookup. It inserts the same entityMention node as `#`
// (pointing at the mirrored document entity), so indexing and backlinks treat both alike.
export const DocumentSlashExtension = Extension.create({
  name: 'documentSlash',

  addProseMirrorPlugins() {
    return [
      Suggestion<SuggestionOption>({
        editor: this.editor,
        pluginKey: new PluginKey('documentSlashSuggestion'),
        char: '/',
        items: async ({ query }: { query: string }) => {
          const documents = await searchDocuments(query);
          return documents.map((document) => ({
            id: document.entityId,
            label: document.title,
            description: [...document.path, document.kind].join(' › '),
            refType: 'entity' as const,
            entityType: 'document'
          }));
        },
        render: () => createSuggestionRenderer(),
        command: ({ editor, range, props }) => {
          const { id, label, entityType, refType } = props;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'entityMention', attrs: { id, label, entityType, refType } },
              { type: 'text', text: ' ' }
            ])
            .run();
        }
      })
    ];
  }
});

export const UserMentionExtension = Mention.extend({
  name: 'userMention',

  addAttributes() {
    return {
      ...this.parent?.(),
      label: { default: null },
      refType: { default: 'user' }
    };
  }
}).configure({
  HTMLAttributes: {
    class: 'mention reference-token reference-user'
  },
  suggestion: {
    char: '@',
    items: async ({ query }: { query: string }) => {
      const users = await searchUsers(query);
      return users.map((user) => ({
        id: user.id,
        label: user.label,
        description: user.email ?? user.status,
        refType: 'user' as const
      }));
    },
    render: () => createSuggestionRenderer()
  },
  renderLabel({ node }) {
    return makeReferenceLabel('@', node);
  }
});
