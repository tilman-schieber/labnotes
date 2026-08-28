import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import type { Editor, JSONContent } from '@tiptap/core';
import { attachmentUrl, uploadAttachment } from '../api/backend';
import { createEntityMentionExtension, DocumentSlashExtension, UserMentionExtension } from './extensions/Mention';
import { MarkdownShortcuts } from './extensions/MarkdownShortcuts';
import { createBlankDocument } from '../storage/documentStore';
import { useEffect, useRef } from 'react';
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
  // Fired after the editor uploaded a pasted/dropped file so attachment lists can refresh.
  onAttachmentUploaded: () => void;
};

// Uploads image files from a paste/drop and inserts them; returns whether anything was handled.
function uploadImages(editor: Editor, documentId: string | null, files: FileList | File[] | null, onUploaded: () => void): boolean {
  const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
  if (!documentId || images.length === 0) {
    return false;
  }

  void (async () => {
    for (const file of images) {
      try {
        const attachment = await uploadAttachment(documentId, file);
        editor.chain().focus().setImage({ src: attachmentUrl(attachment.id), alt: attachment.filename }).run();
      } catch {
        // Surfacing per-file errors would need UI plumbing; the attachments panel shows the state.
      }
    }
    onUploaded();
  })();
  return true;
}

export default function NotebookEditor({
  documentId,
  initialContent,
  editable,
  documentKind,
  onEditorReady,
  onDocumentChange,
  onDeleteDocument,
  onDocumentRestored,
  onSaveAsTemplate,
  onAttachmentUploaded
}: Props) {
  // The paste/drop handlers are created before `editor` exists, so they read it through a ref.
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    editorProps: {
      handlePaste: (_view, event) =>
        Boolean(editorRef.current && uploadImages(editorRef.current, documentId, event.clipboardData?.files ?? null, onAttachmentUploaded)),
      handleDrop: (_view, event) =>
        Boolean(editorRef.current && uploadImages(editorRef.current, documentId, event.dataTransfer?.files ?? null, onAttachmentUploaded))
    },
    extensions: [
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'notebook-image' } }),
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
      TaskList,
      TaskItem.configure({ nested: true }),
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

  editorRef.current = editor;

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
        <button
          type="button"
          className="editor-action-button"
          onClick={() => documentId && window.open(`/api/documents/${documentId}/export.pdf`, '_blank', 'noopener')}
          disabled={!editable || !documentId}
          title="Render this document to PDF with Typst"
        >
          Export PDF
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
