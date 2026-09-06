import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconBook } from '../ui/icons';

// The documentation lives in docs/*.md so it reads on GitHub as well; here it is rendered in
// place so help is one click away from the text being written.
const SOURCES = import.meta.glob('../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const HELP_PAGES: { id: string; title: string }[] = [
  { id: 'index', title: 'Overview' },
  { id: 'writing', title: 'Writing a protocol' },
  { id: 'chemistry', title: 'Chemistry & reactions' },
  { id: 'entities', title: 'Entities & registry' },
  { id: 'history', title: 'Revisions, signatures & sharing' },
  { id: 'export', title: 'PDF export' },
  { id: 'data', title: 'Data, backends & API' },
  { id: 'keyboard', title: 'Keyboard' },
  { id: 'glossary', title: 'Glossary' }
];

function sourceFor(id: string): string {
  const entry = Object.entries(SOURCES).find(([path]) => path.endsWith(`/${id}.md`));
  return entry?.[1] ?? `# Not found\n\nThere is no page called \`${id}\`.`;
}

// GitHub's heading-anchor rule, so links written for GitHub resolve here too: lowercase, drop
// punctuation, then one hyphen per space (runs of spaces are not collapsed).
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

type Props = {
  page: string;
  onNavigate: (page: string) => void;
};

export default function HelpView({ page, onNavigate }: Props) {
  const [anchor, setAnchor] = useState<string | null>(null);
  const article = useRef<HTMLElement | null>(null);
  const html = useMemo(() => marked.parse(sourceFor(page), { async: false, gfm: true }) as string, [page]);

  // Anchors and in-page links after each render of the markdown.
  useEffect(() => {
    const root = article.current;
    if (!root) {
      return;
    }
    root.querySelectorAll('h1, h2, h3, h4').forEach((heading) => {
      heading.id = slugify(heading.textContent ?? '');
    });
    root.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href') ?? '';
      if (/^https?:/.test(href)) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener');
      }
    });
    if (anchor) {
      root.querySelector(`#${CSS.escape(anchor)}`)?.scrollIntoView({ block: 'start' });
    } else {
      root.scrollIntoView({ block: 'start' });
    }
  }, [html, anchor]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (!link || !href || /^https?:/.test(href)) {
      return;
    }
    event.preventDefault();
    const match = /^(?:\.\/)?([\w-]+)\.md(?:#([\w-]+))?$/.exec(href) ?? /^#([\w-]+)$/.exec(href);
    if (!match) {
      return;
    }
    const [, first, second] = match;
    if (href.startsWith('#')) {
      setAnchor(first);
      return;
    }
    setAnchor(second ?? null);
    onNavigate(first);
  };

  return (
    <div className="help">
      <nav className="help-nav" aria-label="Documentation">
        <span className="panel-title">
          <IconBook size={14} />
          Documentation
        </span>
        <ul>
          {HELP_PAGES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`help-nav-item${item.id === page ? ' is-active' : ''}`}
                onClick={() => {
                  setAnchor(null);
                  onNavigate(item.id);
                }}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
        <div className="help-nav-foot">
          Also in <code>docs/</code> in the repository.
        </div>
      </nav>
      <article ref={article} className="help-article" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
