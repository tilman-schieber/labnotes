import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertMhchem, documentToTypst, escapeText } from './typst.mjs';

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content) => ({ type: 'paragraph', content });
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] });

test('escapes Typst markup characters in prose', () => {
  assert.equal(escapeText('5 # * _ $ @ <a> [b] `c` ~ \\'), '5 \\# \\* \\_ \\$ \\@ \\<a\\> \\[b\\] \\`c\\` \\~ \\\\');
  assert.equal(escapeText('= not a heading'), '\\= not a heading');
  assert.equal(escapeText('- not a list'), '\\- not a list');
  assert.equal(escapeText('http://x // y'), 'http:\\//x \\// y');
});

test('rewrites mhchem into plain LaTeX for mitex', () => {
  assert.equal(convertMhchem('\\ce{H2SO4}'), '\\mathrm{H_{2}SO_{4}}');
  assert.equal(convertMhchem('\\ce{2H2 + O2 -> 2H2O}'), '2\\mathrm{H_{2}} + \\mathrm{O_{2}} \\rightarrow 2\\mathrm{H_{2}O}');
  assert.equal(convertMhchem('\\ce{SO4^2-}'), '\\mathrm{SO_{4}}^{2-}');
  assert.equal(convertMhchem('\\ce{Ca^2+ (aq)}'), '\\mathrm{Ca}^{2+} \\mathrm{\\,(\\mathrm{aq})}');
  assert.equal(convertMhchem('\\ce{A <=> B}'), '\\mathrm{A} \\rightleftharpoons \\mathrm{B}');
  assert.equal(convertMhchem('x^2 + \\ce{NaCl}'), 'x^2 + \\mathrm{NaCl}');
  assert.equal(convertMhchem('\\frac{a}{b}'), '\\frac{a}{b}');
});

test('renders headings, marks, lists, tables and inline nodes', () => {
  const doc = {
    title: 'Aspirin',
    metadata: { status: 'in_progress', date: '2026-08-28', tags: ['demo'] },
    content: {
      type: 'doc',
      content: [
        heading(1, 'Aspirin'),
        paragraph(text('bold', [{ type: 'bold' }]), text(' and '), text('link', [{ type: 'link', attrs: { href: 'https://x.y' } }])),
        { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(text('one'))] }, { type: 'listItem', content: [paragraph(text('two'))] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph(text('done'))] }] },
        paragraph(
          { type: 'quantity', attrs: { value: 2.5, unit: 'mL' } },
          text(' of '),
          { type: 'entityMention', attrs: { id: 'e1', label: 'Salicylic acid', entityType: 'compound' } },
          text(' by '),
          { type: 'userMention', attrs: { id: 'u1', label: 'Researcher' } },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
          { type: 'inlineMath', attrs: { latex: '\\ce{H2O}' } }
        ),
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph(text('h'))] }, { type: 'tableCell', content: [paragraph(text('c'))] }] }] }
      ]
    }
  };

  const typst = documentToTypst(doc, { path: ['Group', 'Project'] });
  assert.match(typst, /^#import "@preview\/mitex/);
  assert.match(typst, /Group › Project/);
  assert.match(typst, /in progress · 2026-08-28 · \\#demo/);
  assert.match(typst, /\n= Aspirin\n/);
  assert.match(typst, /\*bold\* and #link\("https:\/\/x\.y"\)\[link\]/);
  assert.match(typst, /- one\n- two/);
  assert.match(typst, /- ☑ done/);
  assert.match(typst, /\[2\.5 mL\]/);
  assert.match(typst, /\[\\#Salicylic acid\]/);
  assert.match(typst, /\[\\@Researcher\]/);
  assert.match(typst, /#mi\("x\^2"\)/);
  assert.match(typst, /#mi\("\\\\mathrm\{H_\{2\}O\}"\)/);
  assert.match(typst, /#table\(columns: 2,[\s\S]*\[\*h\*\], \[c\]/);
});

test('reaction blocks render computed stoichiometry and structures', () => {
  const assets = new Map();
  const entities = new Map([['cmp', { svg: '<svg/>' }]]);
  const doc = {
    content: {
      type: 'doc',
      content: [
        {
          type: 'reaction',
          attrs: {
            title: 'Step 1',
            components: [
              { id: 'a', role: 'reactant', entityId: 'cmp', label: 'Acid', molecularWeight: 100, mass: { value: 1, unit: 'g' }, equivalents: null, volume: null, density: null, concentration: null, limiting: false, actualMass: null },
              { id: 'p', role: 'product', entityId: null, label: 'Ester', molecularWeight: 150, equivalents: 1, mass: null, volume: null, density: null, concentration: null, limiting: false, actualMass: { value: 1.2, unit: 'g' } }
            ]
          }
        }
      ]
    }
  };

  const typst = documentToTypst(doc, { entities, assets });
  assert.match(typst, /\*Step 1\*/);
  assert.match(typst, /Acid \(lim\.\) #box\(image\("structure-cmp\.svg"/);
  assert.match(typst, /theor\. 1\.5 g/);
  assert.match(typst, /1\.2 g \(80%\)/);
  assert.deepEqual([...assets.keys()], ['structure-cmp.svg']);
});
