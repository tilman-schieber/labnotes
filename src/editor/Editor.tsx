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
import { useEffect, useRef, type ReactNode } from 'react';
import { attachmentUrl, uploadAttachment } from '../api/backend';
import { createEntityMentionExtension, UserMentionExtension } from './extensions/Mention';
import { SlashCommands } from './extensions/SlashCommands';
import { TimestampNode } from './extensions/Timestamp';
import { MarkdownShortcuts } from './extensions/MarkdownShortcuts';
import { createBlankDocument } from '../storage/documentStore';
import { NotebookDocument, NotebookDocumentStructure, NotebookTitlePlaceholder } from './extensions/NotebookDocument';
import { BlockMath, InlineMath } from './extensions/Math';
import type { NotebookDocumentKind } from '../documents/templates';
import { LinkExtension } from './extensions/Link';
import { QuantityNode } from './extensions/Quantity';
import { ReactionNode } from './extensions/Reaction';
import { TrailingParagraph } from './extensions/TrailingParagraph';

type Props = {
  documentId: string | null;
  initialContent: JSONContent | null;
  editable: boolean;
  documentKind: NotebookDocumentKind;
  onEditorReady: (editor: Editor | null) => void;
  onDocumentChange: (document: JSONContent) => void;
  // Fired after the editor uploaded a pasted/dropped file so attachment lists can refresh.
  onAttachmentUploaded: () => void;
  // Rendered inside the sticky toolbar strip above the content.
  toolbar?: ReactNode;
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
  onAttachmentUploaded,
  toolbar
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
      SlashCommands,
      TimestampNode,
      QuantityNode,
      ReactionNode,
      TrailingParagraph,
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
    <div className="editor-frame">
      {toolbar}
      {/* Clicking the blank area below the content puts the caret at the end, like a page. */}
      <div
        className="editor-shell"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && editor) {
            event.preventDefault();
            editor.commands.focus('end');
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
