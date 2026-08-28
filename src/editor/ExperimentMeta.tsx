import { useEffect, useState } from 'react';
import { DOCUMENT_STATUSES, type DocumentMetadata, type DocumentStatus } from '../api/backend';

type Props = {
  metadata: DocumentMetadata;
  createdAt: string;
  onChange: (metadata: DocumentMetadata) => void;
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  failed: 'Failed',
  abandoned: 'Abandoned'
};

function parseTags(text: string): string[] {
  return [...new Set(text.split(/[,\s]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

// Inline status / date / tags pills for an experiment. Saves on change; tags commit on Enter, comma or blur.
export default function ExperimentMeta({ metadata, createdAt, onChange }: Props) {
  const [tagDraft, setTagDraft] = useState('');
  const tags = metadata.tags ?? [];

  useEffect(() => {
    setTagDraft('');
  }, [metadata.tags]);

  const commitTags = () => {
    const next = parseTags(tagDraft);
    if (next.length === 0) {
      return;
    }
    onChange({ ...metadata, tags: [...new Set([...tags, ...next])] });
    setTagDraft('');
  };

  const removeTag = (tag: string) => onChange({ ...metadata, tags: tags.filter((item) => item !== tag) });

  return (
    <div className="experiment-meta">
      <span className={`meta-field status-pill status-${metadata.status ?? 'none'}`}>
        <label htmlFor="meta-status">Status</label>
        <select
          id="meta-status"
          value={metadata.status ?? ''}
          onChange={(event) => onChange({ ...metadata, status: (event.target.value || undefined) as DocumentStatus | undefined })}
        >
          <option value="">—</option>
          {DOCUMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </span>

      <span className="meta-field">
        <label htmlFor="meta-date">Date</label>
        <input
          id="meta-date"
          type="date"
          value={metadata.date ?? createdAt.slice(0, 10)}
          onChange={(event) => onChange({ ...metadata, date: event.target.value || undefined })}
        />
      </span>

      <span className="meta-field meta-tags">
        <label htmlFor="meta-tags">Tags</label>
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            #{tag}
            <button type="button" className="link-button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)} style={{ marginLeft: 4, textDecoration: 'none' }}>
              ×
            </button>
          </span>
        ))}
        <input
          id="meta-tags"
          type="text"
          value={tagDraft}
          placeholder={tags.length === 0 ? 'add tag…' : ''}
          onChange={(event) => {
            if (event.target.value.endsWith(',')) {
              setTagDraft(event.target.value.slice(0, -1));
              window.setTimeout(commitTags, 0);
              return;
            }
            setTagDraft(event.target.value);
          }}
          onBlur={commitTags}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTags();
            }
            if (event.key === 'Backspace' && !tagDraft && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
        />
      </span>
    </div>
  );
}
