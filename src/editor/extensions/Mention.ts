import Mention from '@tiptap/extension-mention';
import type { Editor } from '@tiptap/core';

export type MentionOption = {
  id: string;
  label: string;
};

const mentionOptions: MentionOption[] = [
  { id: 'sample-a', label: 'Sample A' },
  { id: 'sample-b', label: 'Sample B' },
  { id: 'compound-x', label: 'Compound X' }
];

type MentionListState = {
  element: HTMLDivElement;
  selectedIndex: number;
  options: MentionOption[];
  command: ({ id, label }: MentionOption) => void;
};

function positionElement(element: HTMLElement, editor: Editor): void {
  const { from } = editor.state.selection;
  const coords = editor.view.coordsAtPos(from);
  element.style.left = `${coords.left}px`;
  element.style.top = `${coords.bottom + 6}px`;
}

function createList(state: MentionListState): void {
  state.element.innerHTML = '';

  state.options.forEach((option, index) => {
    const item = document.createElement('div');
    item.className = `mention-item${index === state.selectedIndex ? ' is-selected' : ''}`;
    item.textContent = option.label;
    item.onmousedown = (event) => {
      event.preventDefault();
      state.command(option);
    };
    state.element.appendChild(item);
  });
}

function selectOption(state: MentionListState): void {
  const option = state.options[state.selectedIndex];
  if (option) {
    state.command(option);
  }
}

export const MentionExtension = Mention.configure({
  HTMLAttributes: {
    class: 'mention'
  },
  suggestion: {
    char: '@',
    items: ({ query }) => {
      const lowerQuery = query.toLowerCase();
      return mentionOptions.filter((option) => option.label.toLowerCase().includes(lowerQuery));
    },
    render: () => {
      let state: MentionListState | null = null;

      return {
        onStart: (props) => {
          const element = document.createElement('div');
          element.className = 'mention-list';
          element.style.position = 'absolute';
          element.style.zIndex = '1000';

          state = {
            element,
            selectedIndex: 0,
            options: props.items as MentionOption[],
            command: (option) => props.command({ id: option.id, label: option.label })
          };

          createList(state);
          positionElement(element, props.editor);
          document.body.appendChild(element);
        },
        onUpdate: (props) => {
          if (!state) {
            return;
          }

          state.options = props.items as MentionOption[];
          state.command = (option) => props.command({ id: option.id, label: option.label });

          if (state.selectedIndex >= state.options.length) {
            state.selectedIndex = 0;
          }

          createList(state);
          positionElement(state.element, props.editor);
        },
        onKeyDown: (props) => {
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
  },
  renderLabel({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`;
  }
});
