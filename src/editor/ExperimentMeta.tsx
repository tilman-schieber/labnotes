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

// Status / date / tags bar above an experiment. Saves on change; tags commit on blur or Enter.
export default function ExperimentMeta({ metadata, createdAt, onChange }: Props) {
  const [tagsText, setTagsText] = useState((metadata.tags ?? []).join(', '));

  useEffect(() => {
    setTagsText((metadata.tags ?? []).join(', '));
  }, [metadata.tags]);

  const commitTags = () => {
    const tags = parseTags(tagsText);
    if (tags.join(',') !== (metadata.tags ?? []).join(',')) {
      onChange({ ...metadata, tags });
    }
  };

  return (
    <div className="experiment-meta">
      <label>
        Status
        <select
          className={`status-select status-${metadata.status ?? 'none'}`}
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
      </label>
      <label>
        Date
        <input
          type="date"
          value={metadata.date ?? createdAt.slice(0, 10)}
          onChange={(event) => onChange({ ...metadata, date: event.target.value || undefined })}
        />
      </label>
      <label className="experiment-meta-tags">
        Tags
        <input
          type="text"
          value={tagsText}
          placeholder="comma separated"
          onChange={(event) => setTagsText(event.target.value)}
          onBlur={commitTags}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTags();
            }
          }}
        />
      </label>
    </div>
  );
}
