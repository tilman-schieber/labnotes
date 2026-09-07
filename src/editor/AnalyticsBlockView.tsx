import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { attachmentUrl, fetchAttachments, linkAttachment, searchEntities, type BackendAttachment, type BackendEntitySearchResult } from '../api/backend';
import { ANALYTICS_TECHNIQUES, createAnalyticsEntry, type AnalyticsEntry, type AnalyticsTechnique } from '../chemistry/analytics';
import type { AnalyticsAttrs, AnalyticsOptions } from './extensions/Analytics';

// Picks the batch these data describe; batches only.
function BatchPicker({ value, code, disabled, onChange }: { value: string | null; code: string | null; disabled: boolean; onChange: (batch: { id: string; code: string } | null) => void }) {
  const [query, setQuery] = useState(code ?? '');
  const [results, setResults] = useState<BackendEntitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setQuery(code ?? '');
  }, [code]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchEntities(query, { type: 'batch' })
        .then((items) => {
          if (!cancelled) {
            setResults(items);
          }
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, isOpen]);

  return (
    <div className="reaction-compound-picker analytics-batch">
      <input
        type="text"
        className={`reaction-input${value ? ' is-linked' : ''}`}
        value={query}
        placeholder="batch, e.g. TS-012-A"
        disabled={disabled}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 150);
          if (!query.trim() && value) {
            onChange(null);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
      />
      {isOpen && results.length > 0 && (
        <div className="reaction-picker-list">
          {results.map((result) => (
            <div
              key={result.id}
              className="mention-item"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsOpen(false);
                onChange({ id: result.id, code: result.batchCode ?? result.label });
              }}
            >
              <div className="mention-item-label">{result.label}</div>
              <div className="mention-item-meta">{result.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsBlockView({ node, updateAttributes, editor, selected, extension }: NodeViewProps) {
  const attrs = node.attrs as AnalyticsAttrs;
  const documentId = (extension.options as AnalyticsOptions).documentId;
  const disabled = !editor.isEditable;
  const [attachments, setAttachments] = useState<BackendAttachment[]>([]);

  useEffect(() => {
    if (!documentId) {
      return;
    }
    let cancelled = false;
    fetchAttachments(documentId)
      .then((items) => {
        if (!cancelled) {
          setAttachments(items);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId, attrs.entries.length]);

  const setEntries = (entries: AnalyticsEntry[]) => updateAttributes({ entries });
  const patch = (id: string, changes: Partial<AnalyticsEntry>) => setEntries(attrs.entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
  const remove = (id: string) => setEntries(attrs.entries.filter((entry) => entry.id !== id));
  const add = () => setEntries([...attrs.entries, createAnalyticsEntry(attrs.entries.length === 0 ? 'TLC' : '1H NMR')]);

  const toggleAttachment = (entry: AnalyticsEntry, attachment: BackendAttachment) => {
    const linked = entry.attachmentIds.includes(attachment.id);
    patch(entry.id, { attachmentIds: linked ? entry.attachmentIds.filter((id) => id !== attachment.id) : [...entry.attachmentIds, attachment.id] });
    // The file itself remembers which batch it describes, so the registry can list it.
    if (attrs.batchId) {
      void linkAttachment(attachment.id, linked ? null : attrs.batchId).catch(() => undefined);
    }
  };

  return (
    <NodeViewWrapper className={`analytics-block${selected ? ' is-selected' : ''}`} data-drag-handle>
      <div className="analytics-header">
        <span className="panel-title">Analytics</span>
        <BatchPicker value={attrs.batchId} code={attrs.batchCode} disabled={disabled} onChange={(batch) => updateAttributes({ batchId: batch?.id ?? null, batchCode: batch?.code ?? null })} />
        {!attrs.batchId && <span className="entity-muted">Pick the batch these data describe, or register one from the reaction table.</span>}
      </div>
      <table className="analytics-table">
        <tbody>
          {attrs.entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <select className="reaction-input" value={entry.technique} disabled={disabled} onChange={(event) => patch(entry.id, { technique: event.target.value as AnalyticsTechnique })}>
                  {ANALYTICS_TECHNIQUES.map((technique) => (
                    <option key={technique} value={technique}>
                      {technique}
                    </option>
                  ))}
                </select>
              </td>
              <td className="analytics-result">
                {entry.technique === 'TLC' && (
                  <div className="reaction-stack analytics-tlc">
                    <input
                      type="number"
                      className="reaction-input reaction-input-number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={entry.rf ?? ''}
                      placeholder="Rf"
                      disabled={disabled}
                      onChange={(event) => patch(entry.id, { rf: event.target.value === '' ? null : Number(event.target.value) })}
                    />
                    <input type="text" className="reaction-input" value={entry.eluent ?? ''} placeholder="eluent, e.g. 3:1 hexanes/EtOAc" disabled={disabled} onChange={(event) => patch(entry.id, { eluent: event.target.value || undefined })} />
                  </div>
                )}
                <textarea
                  className="reaction-input analytics-text"
                  rows={entry.result.length > 80 ? 3 : 1}
                  value={entry.result}
                  placeholder={entry.technique === '1H NMR' ? 'δ 8.05 (d, J = 7.8 Hz, 2H), …' : entry.technique === 'MS' ? 'm/z 137 [M+H]+' : 'observation'}
                  disabled={disabled}
                  onChange={(event) => patch(entry.id, { result: event.target.value })}
                />
                {attachments.length > 0 && (
                  <div className="analytics-attachments">
                    {attachments.map((attachment) => {
                      const linked = entry.attachmentIds.includes(attachment.id);
                      return (
                        <button key={attachment.id} type="button" className={`tag-chip analytics-attachment${linked ? ' is-linked' : ''}`} disabled={disabled} title={linked ? 'Linked to this entry — click to unlink' : 'Link this file to the entry'} onClick={() => toggleAttachment(entry, attachment)}>
                          {linked ? '📎 ' : ''}
                          {attachment.filename}
                        </button>
                      );
                    })}
                  </div>
                )}
                {entry.attachmentIds.length > 0 && disabled && (
                  <div className="analytics-attachments">
                    {entry.attachmentIds.map((id) => (
                      <a key={id} href={attachmentUrl(id)} target="_blank" rel="noopener">
                        {attachments.find((attachment) => attachment.id === id)?.filename ?? id}
                      </a>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <button type="button" className="link-button" disabled={disabled} onClick={() => remove(entry.id)} aria-label="Remove entry">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && (
        <div className="reaction-actions">
          <button type="button" onClick={add}>
            + entry
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}
