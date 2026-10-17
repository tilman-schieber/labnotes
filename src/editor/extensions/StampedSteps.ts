import { Extension } from '@tiptap/core';

// Protocol mode: with stamping on, every new list item starts with the current time, so a
// procedure written as it happens records when each step began. Off by default; the toolbar
// toggles it and the choice is kept per document in this browser.

const STORAGE_PREFIX = 'lab-notebook-stamp-steps:';

export function readStampSteps(documentId: string | null): boolean {
  if (!documentId) {
    return false;
  }
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${documentId}`) === '1';
  } catch {
    return false;
  }
}

export function writeStampSteps(documentId: string | null, enabled: boolean): void {
  if (!documentId) {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${documentId}`, '1');
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${documentId}`);
    }
  } catch {
    // Blocked storage: the choice lasts for this page load only.
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    stampedSteps: {
      setStampSteps: (enabled: boolean) => ReturnType;
    };
  }
}

export const StampedSteps = Extension.create<{ enabled: boolean }, { enabled: boolean }>({
  name: 'stampedSteps',
  // Above the list extensions, whose Enter handlers would otherwise run first.
  priority: 1000,

  addOptions() {
    return { enabled: false };
  },

  addStorage() {
    return { enabled: this.options.enabled };
  },

  addCommands() {
    return {
      setStampSteps:
        (enabled) =>
        () => {
          this.storage.enabled = enabled;
          return true;
        }
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.storage.enabled) {
          return false;
        }
        const { editor } = this;
        const itemType = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
        if (!itemType) {
          return false;
        }
        const { $from } = editor.state.selection;
        const paragraph = $from.parent;
        if (paragraph.content.size === 0) {
          return false;
        }
        // An item holding nothing but the stamp we put there: the writer is leaving the list.
        // Drop the stamp and let Enter on an empty item do what it always does (lift out).
        const onlyStamp = paragraph.content.content.every((child) => child.type.name === 'timestamp' || (child.isText && child.text?.trim() === ''));
        if (onlyStamp) {
          editor.view.dispatch(editor.state.tr.delete($from.start(), $from.end()));
          return editor.commands.splitListItem(itemType);
        }
        if (!editor.commands.splitListItem(itemType)) {
          return false;
        }
        editor.commands.insertTimestamp();
        return true;
      }
    };
  }
});
