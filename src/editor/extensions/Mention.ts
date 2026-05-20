import Mention from '@tiptap/extension-mention';
import type { Editor } from '@tiptap/core';
import { searchEntities, searchUsers } from '../../api/backend';

type SuggestionOption = {
  id: string;
  label: string;
  description?: string;
  refType: 'entity' | 'user';
  entityType?: string;
};

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
    item.className = `mention-item${index === state.selectedIndex ? ' is-selected' : ''}`;

    const label = document.createElement('div');
    label.className = 'mention-item-label';
    label.textContent = option.label;

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
        command: (option) => props.command(option)
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
      state.command = (option) => props.command(option);
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

export const EntityMentionExtension = Mention.extend({
  name: 'entityMention',

  addAttributes() {
    return {
      ...this.parent?.(),
      label: { default: null },
      entityType: { default: 'entity' },
      refType: { default: 'entity' }
    };
  }
}).configure({
  HTMLAttributes: {
    class: 'mention reference-token reference-entity'
  },
  suggestion: {
    char: '#',
    items: async ({ query }: { query: string }) => {
      const entities = await searchEntities(query);
      return entities.map((entity) => ({
        id: entity.id,
        label: entity.label,
        description: entity.description,
        refType: 'entity' as const,
        entityType: entity.type
      }));
    },
    render: () => createSuggestionRenderer()
  },
  renderLabel({ node }) {
    return makeReferenceLabel('#', node);
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
