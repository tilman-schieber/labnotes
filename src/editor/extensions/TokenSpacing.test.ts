import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Schema } from '@tiptap/pm/model';
import { tokenSpacingDecision } from './TokenSpacing.ts';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    quantity: { group: 'inline', inline: true, atom: true, attrs: { value: { default: 0 }, unit: { default: '' } } }
  }
});

function paragraph(...parts: (string | 'Q')[]) {
  const nodes = parts.map((part) => (part === 'Q' ? schema.nodes.quantity.create({ value: 2, unit: 'h' }) : schema.text(part)));
  return schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, nodes)]);
}

test('a second space after a token is swallowed', () => {
  const doc = paragraph('for ', 'Q', ' ');
  // positions: 0 doc, 1 para start, "for " = 1..5, token at 5..6, space 6..7, caret 7
  assert.equal(tokenSpacingDecision(doc, 7, ' '), 'swallow');
});

test('punctuation after the token space replaces the space', () => {
  const doc = paragraph('for ', 'Q', ' ');
  assert.equal(tokenSpacingDecision(doc, 7, '.'), 'replace');
  assert.equal(tokenSpacingDecision(doc, 7, ','), 'replace');
});

test('ordinary text after the space is left alone', () => {
  const doc = paragraph('for ', 'Q', ' ');
  assert.equal(tokenSpacingDecision(doc, 7, 'a'), null);
});

test('spaces not preceded by a token are untouched', () => {
  const doc = paragraph('stir ');
  assert.equal(tokenSpacingDecision(doc, 6, ' '), null);
  assert.equal(tokenSpacingDecision(doc, 6, '.'), null);
});
