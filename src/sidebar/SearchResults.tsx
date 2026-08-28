import { useEffect, useState, type ReactNode } from 'react';
import { searchNotebook, type NotebookSearchResult } from '../api/backend';

type Props = {
  queryText: string;
  onOpenDocument: (documentId: string) => void;
};

// Renders a ts_headline snippet, turning [[match]] markers into highlighted spans.
function renderSnippet(snippet: string): ReactNode[] {
  return snippet.split(/(\[\[.*?\]\])/g).map((part, index) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <mark key={index}>{part.slice(2, -2)}</mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

export default function SearchResults({ queryText, onOpenDocument }: Props) {
  const [results, setResults] = useState<NotebookSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tag = queryText.startsWith('#') && !queryText.includes(' ') ? queryText.slice(1) : undefined;
    const timer = window.setTimeout(() => {
      searchNotebook(tag ? '' : queryText, tag)
        .then((items) => {
          if (!cancelled) {
            setResults(items);
            setError(null);
          }
        })
        .catch((searchError: unknown) => {
          if (!cancelled) {
            setError(searchError instanceof Error ? searchError.message : 'Search failed');
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [queryText]);

  if (error) {
    return <div className="status-inline">{error}</div>;
  }

  if (results.length === 0) {
    return <div className="search-empty">No matches</div>;
  }

  return (
    <div className="search-results">
      {results.map((result) => (
        <button key={result.id} type="button" className="search-result" onClick={() => onOpenDocument(result.id)}>
          <div className="search-result-title">
            {result.status && <span className={`status-dot status-${result.status}`} />}
            {result.title}
          </div>
          {result.path.length > 0 && <div className="search-result-path">{result.path.join(' › ')}</div>}
          {result.snippet && <div className="search-result-snippet">{renderSnippet(result.snippet)}</div>}
          {result.tags.length > 0 && <div className="search-result-tags">{result.tags.map((tag) => `#${tag}`).join(' ')}</div>}
        </button>
      ))}
    </div>
  );
}
