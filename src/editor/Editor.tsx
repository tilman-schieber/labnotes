import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import type { Editor, JSONContent } from '@tiptap/core';
import { EntityMentionExtension, UserMentionExtension } from './extensions/Mention';
import { MarkdownShortcuts } from './extensions/MarkdownShortcuts';
import { createBlankDocument } from '../storage/documentStore';
import { useEffect } from 'react';
import { ProtocolDocument, ProtocolDocumentStructure, ProtocolTitlePlaceholder } from './extensions/ProtocolDocument';
import { BlockMath, InlineMath } from './extensions/Math';
import type { NotebookDocumentKind } from '../documents/templates';
import { LinkExtension } from './extensions/Link';

type Props = {
  initialContent: JSONContent | null;
  editable: boolean;
  documentKind: NotebookDocumentKind;
  onEditorReady: (editor: Editor | null) => void;
  onDocumentChange: (document: JSONContent) => void;
  onDeleteDocument: () => void;
};

export default function NotebookEditor({
  initialContent,
  editable,
  documentKind,
  onEditorReady,
  onDocumentChange,
  onDeleteDocument
}: Props) {
  const editor = useEditor({
    extensions: [
      ProtocolDocument,
      StarterKit.configure({
        document: false
      }),
      ProtocolDocumentStructure.configure({
        kind: documentKind
      }),
      ProtocolTitlePlaceholder,
      MarkdownShortcuts,
      LinkExtension,
      BlockMath,
      InlineMath,
      EntityMentionExtension,
      UserMentionExtension,
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
        <button type="button" className="editor-action-button" disabled title="Not implemented yet">
          Reprocess
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
