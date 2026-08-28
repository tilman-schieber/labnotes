import { useEffect, useRef, useState } from 'react';
import { attachmentUrl, deleteAttachment, fetchAttachments, uploadAttachment, type BackendAttachment } from '../api/backend';
import { IconPaperclip, IconPlus } from '../ui/icons';

type Props = {
  documentId: string;
  // Called after an image upload so the caller can insert it into the editor.
  onInsertImage?: (attachment: BackendAttachment) => void;
  // Bumped by the editor when it uploaded a pasted/dropped file itself.
  refreshToken?: number;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsPanel({ documentId, onInsertImage, refreshToken }: Props) {
  const [attachments, setAttachments] = useState<BackendAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    try {
      setAttachments(await fetchAttachments(documentId));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load attachments');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, refreshToken]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadAttachment(documentId, file);
        if (attachment.mimeType.startsWith('image/')) {
          onInsertImage?.(attachment);
        }
      }
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (attachment: BackendAttachment) => {
    if (!window.confirm(`Delete "${attachment.filename}"? Images already placed in the text will stop loading.`)) {
      return;
    }
    try {
      await deleteAttachment(attachment.id);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete attachment');
    }
  };

  return (
    <div className="panel attachments">
      <div className="attachments-header">
        <span className="panel-title">
          <IconPaperclip size={14} />
          Attachments{attachments.length > 0 ? ` · ${attachments.length}` : ''}
        </span>
        <input ref={inputRef} type="file" multiple hidden onChange={(event) => void handleFiles(event.target.files)} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={isUploading}>
          <IconPlus size={14} />
          {isUploading ? 'Uploading…' : 'Attach'}
        </button>
      </div>
      {error && <div className="entity-error">{error}</div>}
      {attachments.length === 0 && !error && <div className="attachments-empty">Drop images into the text or attach files here.</div>}
      {attachments.length > 0 && (
        <ul className="attachments-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.mimeType.startsWith('image/') && (
                <img className="attachments-thumb" src={attachmentUrl(attachment.id)} alt="" loading="lazy" />
              )}
              <a href={attachmentUrl(attachment.id)} target="_blank" rel="noopener noreferrer">
                {attachment.filename}
              </a>
              <span className="faint">{formatSize(attachment.sizeBytes)}</span>
              <a className="link-button" href={attachmentUrl(attachment.id, true)}>
                download
              </a>
              {attachment.mimeType.startsWith('image/') && onInsertImage && (
                <button type="button" className="link-button" onClick={() => onInsertImage(attachment)}>
                  insert
                </button>
              )}
              <button type="button" className="link-button" onClick={() => void handleDelete(attachment)}>
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
