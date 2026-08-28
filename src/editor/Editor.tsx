import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import type { Editor, JSONContent } from '@tiptap/core';
import { createEntityMentionExtension, DocumentSlashExtension, UserMentionExtension } from './extensions/Mention';
import { MarkdownShortcuts } from './extensions/MarkdownShortcuts';
import { createBlankDocument } from '../storage/documentStore';
import { useEffect } from 'react';
import { NotebookDocument, NotebookDocumentStructure, NotebookTitlePlaceholder } from './extensions/NotebookDocument';
import { BlockMath, InlineMath } from './extensions/Math';
import type { NotebookDocumentKind } from '../documents/templates';
import { LinkExtension } from './extensions/Link';
import RevisionHistory from './RevisionHistory';
import { QuantityNode } from './extensions/Quantity';
import { ReactionNode } from './extensions/Reaction';

type Props = {
  documentId: string | null;
  initialContent: JSONContent | null;
  editable: boolean;
  documentKind: NotebookDocumentKind;
  onEditorReady: (editor: Editor | null) => void;
  onDocumentChange: (document: JSONContent) => void;
  onDeleteDocument: () => void;
  onDocumentRestored: () => void;
  // null when the current document kind cannot become a template
  onSaveAsTemplate: (() => void) | null;
};

export default function NotebookEditor({
  documentId,
  initialContent,
  editable,
  documentKind,
  onEditorReady,
  onDocumentChange,
  onDeleteDocument,
  onDocumentRestored,
  onSaveAsTemplate
}: Props) {
  const editor = useEditor({
    extensions: [
      NotebookDocument,
      StarterKit.configure({
        document: false
      }),
      NotebookDocumentStructure.configure({
        kind: documentKind
      }),
      NotebookTitlePlaceholder,
      MarkdownShortcuts,
      LinkExtension,
      BlockMath,
      InlineMath,
      createEntityMentionExtension(documentId),
      UserMentionExtension,
      DocumentSlashExtension,
      QuantityNode,
      ReactionNode,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell
    ],
    editable,
    content: initialContent ?? createBlankDocument(),
    onUpdate: ({ editor: currentEditor }) => {
      onDocumentChange(currentEditor.getJSON());
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    onEditorReady(editor);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  return (
    <div className="editor-shell">
      <div className="editor-actions">
        <RevisionHistory documentId={editable ? documentId : null} onRestored={onDocumentRestored} />
        <button
          type="button"
          className="editor-action-button"
          onClick={onSaveAsTemplate ?? undefined}
          disabled={!editable || !onSaveAsTemplate}
          title={onSaveAsTemplate ? 'Save this experiment as a reusable template' : 'Only experiments can become templates'}
        >
          Save as template
        </button>
        <button type="button" className="editor-action-button" disabled title="Not implemented yet">
          Share
        </button>
        <button
          type="button"
          className="editor-action-button is-danger"
          onClick={onDeleteDocument}
          disabled={!editable}
        >
          Delete
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
