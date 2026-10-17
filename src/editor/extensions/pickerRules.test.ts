import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCreateDraft, looksLikeProse } from './pickerRules.ts';

test('short names are names', () => {
  for (const query of ['Benz', 'Dry toluene', 'Lysis buffer stock', 'Sodium chloride solution']) {
    assert.equal(looksLikeProse(query), false, query);
    assert.equal(canCreateDraft(query), true, query);
  }
});

test('sentence punctuation ends the name', () => {
  assert.equal(looksLikeProse('toluene.'), true);
  assert.equal(looksLikeProse('toluene,'), true);
});

test('more than three words is prose', () => {
  assert.equal(looksLikeProse('toluene and some more words'), true);
});

test('a stop word after the first word is prose', () => {
  assert.equal(looksLikeProse('toluene was'), true);
  assert.equal(looksLikeProse('Et2O and'), true);
  assert.equal(looksLikeProse('toluene added'), true);
  // The first word may be anything, including a word from the list.
  assert.equal(looksLikeProse('Dry'), false);
  assert.equal(looksLikeProse('The compound'), false);
});

test('empty query cannot create', () => {
  assert.equal(canCreateDraft('   '), false);
});
