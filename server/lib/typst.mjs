import { computeReaction } from '../../src/chemistry/reaction.ts';
import { formatQuantity } from '../../src/units/quantity.ts';

// Characters that start Typst markup or code when they appear in plain text.
const SPECIAL = /[\\#*_$@<>\[\]`~]/g;
const LINE_START = /^([=\-+/])/;

export function escapeText(text) {
  return String(text)
    .replace(SPECIAL, (char) => `\\${char}`)
    .replace(/\/(?=[/*])/g, '\\/')
    .replace(LINE_START, '\\$1');
}

function escapeString(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const MHCHEM_ARROWS = {
  '->': '\\rightarrow',
  '<-': '\\leftarrow',
  '<=>': '\\rightleftharpoons',
  '<->': '\\leftrightarrow',
  '<=>>': '\\rightleftharpoons',
  '<<=>': '\\rightleftharpoons'
};

// One mhchem species like "2H2O", "SO4^2-", "Ca^2+ (aq)" -> plain LaTeX.
function mhchemSpecies(token) {
  const coefficient = /^(\d+(?:\.\d+)?)(?=[A-Z(\[])/.exec(token);
  let rest = coefficient ? token.slice(coefficient[1].length) : token;

  let charge = '';
  const chargeMatch = /\^(\{[^}]*\}|\d*[+-])$/.exec(rest);
  if (chargeMatch) {
    charge = `^{${chargeMatch[1].replace(/^\{|\}$/g, '')}}`;
    rest = rest.slice(0, -chargeMatch[0].length);
  }

  const body = rest
    .replace(/\((aq|s|l|g)\)/g, '\\,(\\mathrm{$1})')
    .replace(/(?<=[A-Za-z)\]])(\d+)/g, '_{$1}');

  return `${coefficient ? coefficient[1] : ''}\\mathrm{${body}}${charge}`;
}

function mhchemToLatex(expression) {
  return expression
    .trim()
    .split(/\s+/)
    .map((token) => MHCHEM_ARROWS[token] ?? (token === '+' ? '+' : mhchemSpecies(token)))
    .join(' ');
}

// mitex has no mhchem: rewrite \ce{...} into plain LaTeX it understands.
export function convertMhchem(latex) {
  let result = '';
  let index = 0;
  const source = String(latex);

  while (index < source.length) {
    const start = source.indexOf('\\ce{', index);
    if (start === -1) {
      result += source.slice(index);
      break;
    }

    result += source.slice(index, start);
    let depth = 0;
    let end = start + 3;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    result += mhchemToLatex(source.slice(start + 4, end));
    index = end + 1;
  }

  return result;
}

function applyMarks(text, marks = []) {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `*${result}*`;
        break;
      case 'italic':
        result = `_${result}_`;
        break;
      case 'strike':
        result = `#strike[${result}]`;
        break;
      case 'code':
        result = `#raw("${escapeString(text)}")`;
        break;
      case 'link':
        result = `#link("${escapeString(mark.attrs?.href ?? '')}")[${result}]`;
        break;
      default:
        break;
    }
  }
  return result;
}

function statusLabel(status) {
  return status ? status.replace('_', ' ') : null;
}

// Converts TipTap JSON to Typst markup. `assets` collects compound SVGs (file name -> svg text)
// that the caller must write next to the .typ file before compiling.
export function documentToTypst(document, { path = [], entities = new Map(), revision = null, assets = new Map() } = {}) {
  const structureImage = (entityId, height) => {
    const entity = entities.get(entityId);
    if (!entity?.svg) {
      return '';
    }
    const file = `structure-${entityId}.svg`;
    assets.set(file, entity.svg);
    return `#box(image("${file}", height: ${height}))`;
  };

  const inline = (nodes = []) => nodes.map(inlineNode).join('');

  const inlineNode = (node) => {
    switch (node.type) {
      case 'text':
        return applyMarks(escapeText(node.text ?? ''), node.marks);
      case 'hardBreak':
        return ' \\\n';
      case 'entityMention': {
        const isDocument = node.attrs?.entityType === 'document';
        const label = escapeText(`${isDocument ? '/' : '#'}${node.attrs?.label ?? node.attrs?.id ?? ''}`);
        const image = node.attrs?.inlineStructure ? ` ${structureImage(node.attrs.id, '2.4em')}` : '';
        return `#box(fill: rgb("#dcfce7"), inset: (x: 3pt, y: 1pt), radius: 2pt)[${label}]${image}`;
      }
      case 'userMention':
        return `#box(fill: rgb("#ede9fe"), inset: (x: 3pt, y: 1pt), radius: 2pt)[${escapeText(`@${node.attrs?.label ?? ''}`)}]`;
      case 'quantity':
        return `#box(fill: rgb("#fef3c7"), inset: (x: 3pt, y: 1pt), radius: 2pt)[${escapeText(
          formatQuantity({ value: Number(node.attrs?.value ?? 0), unit: String(node.attrs?.unit ?? '') })
        )}]`;
      case 'inlineMath':
        return `#mi("${escapeString(convertMhchem(node.attrs?.latex ?? ''))}")`;
      default:
        return inline(node.content);
    }
  };

  const listItems = (nodes = [], marker) =>
    nodes
      .map((item) => {
        const body = blocks(item.content ?? [], '  ').trim();
        const prefix = item.type === 'taskItem' ? `${marker} ${item.attrs?.checked ? '☑' : '☐'} ` : `${marker} `;
        return `${prefix}${body}`;
      })
      .join('\n');

  const table = (node) => {
    const rows = (node.content ?? []).filter((row) => row.type === 'tableRow');
    const columns = Math.max(...rows.map((row) => (row.content ?? []).length), 1);
    const cells = rows.flatMap((row) =>
      (row.content ?? []).map((cell) => {
        const body = blocks(cell.content ?? [], '').trim();
        return cell.type === 'tableHeader' ? `[*${body}*]` : `[${body}]`;
      })
    );
    return `#table(columns: ${columns}, stroke: 0.5pt + luma(180),\n  ${cells.join(', ')}\n)`;
  };

  const reaction = (node) => {
    const components = Array.isArray(node.attrs?.components) ? node.attrs.components : [];
    const summary = computeReaction(components);
    const title = node.attrs?.title ? escapeText(node.attrs.title) : 'Reaction';
    const header = ['Role', 'Compound', 'MW', 'Equiv', 'mmol', 'Mass', 'Volume', 'Yield'].map((cell) => `[*${cell}*]`);
    // Every cell is escaped exactly once here; the structure image is appended afterwards as markup.
    const rows = summary.components.map((component) => {
      const structure = component.entityId ? structureImage(component.entityId, '1.6em') : '';
      const label = `${escapeText(component.label || '—')}${component.isLimiting ? ' (lim.)' : ''}${structure ? ` ${structure}` : ''}`;
      const mass = component.role === 'product'
        ? component.theoreticalMass ? `theor. ${formatQuantity(component.theoreticalMass)}` : '—'
        : component.mass ? formatQuantity(component.mass) : component.computedMass ? `need ${formatQuantity(component.computedMass)}` : '—';
      const yieldCell = component.role === 'product'
        ? `${component.actualMass ? formatQuantity(component.actualMass) : ''}${component.yieldPercent !== null ? ` (${component.yieldPercent}%)` : ''}` || '—'
        : '';
      return [
        escapeText(component.role),
        label,
        escapeText(component.molecularWeight ?? '—'),
        escapeText(component.computedEquivalents ?? component.equivalents ?? '—'),
        escapeText(component.amountMmol ?? '—'),
        escapeText(mass),
        escapeText(component.volume ? formatQuantity(component.volume) : ''),
        escapeText(yieldCell)
      ].map((cell) => `[${cell}]`);
    });
    return `#block(stroke: 0.5pt + luma(180), inset: 6pt, radius: 3pt, width: 100%)[
  *${title}*
  #table(columns: 8, stroke: none, inset: 3pt,
    ${[...header, ...rows.flat()].join(', ')}
  )
]`;
  };

  const blocks = (nodes = [], indent = '') =>
    nodes
      .map((node) => {
        switch (node.type) {
          case 'heading':
            return `${'='.repeat(Number(node.attrs?.level ?? 1))} ${inline(node.content)}`;
          case 'paragraph':
            return inline(node.content);
          case 'bulletList':
            return listItems(node.content, '-');
          case 'orderedList':
            return listItems(node.content, '+');
          case 'taskList':
            return listItems(node.content, '-');
          case 'blockquote':
            return `#quote(block: true)[${blocks(node.content, '').trim()}]`;
          case 'codeBlock':
            return `#raw(block: true, "${escapeString(inline(node.content))}")`;
          case 'horizontalRule':
            return '#line(length: 100%)';
          case 'blockMath':
            return `#mitex("${escapeString(convertMhchem(node.attrs?.latex ?? ''))}")`;
          case 'table':
            return table(node);
          case 'reaction':
            return reaction(node);
          default:
            return inline(node.content);
        }
      })
      .filter((chunk) => chunk.trim().length > 0)
      .map((chunk) => chunk.split('\n').map((line) => `${indent}${line}`).join('\n'))
      .join('\n\n');

  const metadata = document.metadata ?? {};
  const headerLines = [
    path.length > 0 ? escapeText(path.join(' › ')) : null,
    [statusLabel(metadata.status), metadata.date, ...(metadata.tags ?? []).map((tag) => `#${tag}`)].filter(Boolean).map(escapeText).join(' · ') || null,
    revision
      ? `Revision ${revision.revision}${revision.signedAt ? ` — signed by ${escapeText(revision.signedByName ?? revision.signedBy)} on ${new Date(revision.signedAt).toISOString().slice(0, 10)}` : ''}`
      : null
  ].filter(Boolean);

  const body = blocks(document.content?.content ?? []);

  return `#import "@preview/mitex:0.2.7": mi, mitex
#set page(margin: 2cm, numbering: "1")
#set text(font: "Libertinus Serif", size: 10.5pt)
#set heading(numbering: none)
#show heading.where(level: 1): set text(size: 18pt)
#show table: set text(size: 9pt)

${headerLines.length > 0 ? `#text(size: 9pt, fill: luma(90))[${headerLines.join(' \\\n')}]\n#v(4pt)\n#line(length: 100%, stroke: 0.5pt + luma(180))\n` : ''}
${body}
`;
}
