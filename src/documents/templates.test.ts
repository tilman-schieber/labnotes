import assert from 'node:assert/strict';
import test from 'node:test';
import type { JSONContent } from '@tiptap/core';
import {
  allowsFreeContent,
  createTemplateDocument,
  extractDocumentTitle,
  normalizeTemplateDocument,
  type NotebookDocumentKind
} from './templates.ts';

const KINDS: NotebookDocumentKind[] = ['group', 'project', 'experiment'];

const withTrailingParagraph = (document: JSONContent): JSONContent => ({
  ...document,
  content: [...(document.content ?? []), { type: 'paragraph' }]
});

test('normalization keeps trailing blocks exactly for the kinds that allow free content', () => {
  // The editor appends an empty trailing paragraph so there is somewhere to type. If the
  // normalizer strips it again for the same kind, the two take turns forever and the tab hangs,
  // so the two rules have to be driven by the same predicate.
  for (const kind of KINDS) {
    const withParagraph = withTrailingParagraph(createTemplateDocument(kind, 'Title'));
    const normalized = normalizeTemplateDocument(kind, withParagraph);
    assert.equal(
      JSON.stringify(normalized) === JSON.stringify(withParagraph),
      allowsFreeContent(kind),
      `${kind}: trailing paragraph survives normalization iff free content is allowed`
    );
  }
});

test('normalization is idempotent for every kind', () => {
  for (const kind of KINDS) {
    const once = normalizeTemplateDocument(kind, withTrailingParagraph(createTemplateDocument(kind, 'Title')));
    assert.deepEqual(normalizeTemplateDocument(kind, once), once, kind);
  }
});

test('group and project pages are reduced to their heading', () => {
  const messy: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Group 2' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'stray text' }] }
    ]
  };

  for (const kind of ['group', 'project'] as NotebookDocumentKind[]) {
    const normalized = normalizeTemplateDocument(kind, messy);
    assert.equal(normalized.content?.length, 1, kind);
    assert.equal(extractDocumentTitle(normalized, 'fallback'), 'Group 2');
  }

  assert.equal(normalizeTemplateDocument('experiment', messy).content?.length, 2);
});

test('a demoted title heading is restored to level 1', () => {
  const demoted: JSONContent = {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Still the title' }] }]
  };

  for (const kind of KINDS) {
    const first = normalizeTemplateDocument(kind, demoted).content?.[0];
    assert.equal(first?.type, 'heading', kind);
    assert.equal(first?.attrs?.level, 1, kind);
    assert.equal(extractDocumentTitle(normalizeTemplateDocument(kind, demoted), 'fallback'), 'Still the title');
  }
});
