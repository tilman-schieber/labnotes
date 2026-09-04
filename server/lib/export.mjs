import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { listAttachments, readAttachmentBytes } from './attachments.mjs';
import { query } from './database.mjs';
import { getRevision, listRevisions } from './revisions.mjs';
import { documentToTypst, projectToTypst, renderDocumentBody } from './typst.mjs';
import { formatQuantity } from '../../src/units/quantity.ts';

const execFileAsync = promisify(execFile);
const TYPST_BIN = process.env.TYPST_BIN ?? 'typst';

let oclPromise = null;
function loadOcl() {
  if (!oclPromise) {
    oclPromise = import('openchemlib');
  }
  return oclPromise;
}

// Compound entities referenced by the documents, with a rendered structure where SMILES is
// known. Keyed by entity id.
async function loadReferencedCompounds(documentIds) {
  const result = await query(
    `
      select distinct e.id, e.label, e.attributes->>'smiles' as smiles, e.attributes->>'formula' as formula,
        e.attributes->>'molecularWeight' as "molecularWeight"
      from document_mentions m
      join entities e on e.id = m.target_id
      where m.document_id = any($1::text[]) and m.ref_type = 'entity' and e.type = 'compound' and e.attributes ? 'smiles'
    `,
    [documentIds]
  );

  const entities = new Map();
  if (result.rowCount === 0) {
    return entities;
  }

  const { Molecule } = await loadOcl();
  for (const row of result.rows) {
    try {
      const molecule = Molecule.fromSmiles(row.smiles);
      entities.set(row.id, {
        label: row.label,
        formula: row.formula,
        molecularWeight: row.molecularWeight ? Number(row.molecularWeight) : null,
        svg: molecule.toSVG(200, 120, undefined, { autoCrop: true, autoCropMargin: 4, suppressChiralText: true })
      });
    } catch {
      // Unparseable SMILES: export without a structure.
    }
  }
  return entities;
}

async function loadAllDocuments() {
  const documents = await query(
    'select id, kind, parent_id as "parentId", title, content, metadata, created_at as "createdAt" from documents order by created_at asc'
  );
  return new Map(documents.rows.map((row) => [row.id, row]));
}

function pathOf(byId, document) {
  const titles = [];
  let current = document.parentId ? byId.get(document.parentId) : null;
  while (current) {
    titles.unshift(current.title);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return titles;
}

// Image nodes point at /api/attachments/<id>; only formats Typst can embed are included.
function imageResolver(attachments, imageFiles) {
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return (src) => {
    const match = /\/api\/attachments\/([^/?#]+)/.exec(src);
    const attachment = match ? attachmentById.get(match[1]) : null;
    if (!attachment || !/^image\/(png|jpeg|gif|svg\+xml)$/.test(attachment.mimeType)) {
      return null;
    }
    const extension = attachment.mimeType === 'image/svg+xml' ? 'svg' : attachment.mimeType.split('/')[1];
    const file = `attachment-${attachment.id}.${extension}`;
    imageFiles.set(file, attachment.id);
    return file;
  };
}

// With `revision`, the export is that frozen snapshot instead of the current content.
async function loadExportContext(documentId, { revision = null } = {}) {
  const byId = await loadAllDocuments();
  let document = byId.get(documentId);
  if (!document) {
    return null;
  }

  let revisionInfo = null;
  if (revision !== null) {
    revisionInfo = await getRevision({ query }, documentId, revision);
    if (!revisionInfo) {
      return null;
    }
    document = { ...document, title: revisionInfo.title, content: revisionInfo.content };
  }

  const [revisions, entities, attachments] = await Promise.all([
    revisionInfo ? [revisionInfo] : listRevisions({ query }, documentId),
    loadReferencedCompounds([documentId]),
    listAttachments({ query }, documentId)
  ]);
  const assets = new Map();
  const imageFiles = new Map();
  const resolveImage = imageResolver(attachments, imageFiles);

  const source = documentToTypst(document, { path: pathOf(byId, document), entities, revision: revisions[0] ?? null, assets, resolveImage });
  for (const [file, attachmentId] of imageFiles) {
    assets.set(file, await readAttachmentBytes(attachmentId));
  }

  return { document, source, assets };
}

const documentDate = (document) => document.metadata?.date ?? String(document.createdAt).slice(0, 10);

// Experiments under a project, or projects (each with its experiments) under a group, in date order.
function collectChapters(byId, root) {
  const children = [...byId.values()]
    .filter((item) => item.parentId === root.id)
    .sort((left, right) => documentDate(left).localeCompare(documentDate(right)) || new Date(left.createdAt) - new Date(right.createdAt));
  return children.map((child) => ({ document: child, children: child.kind === 'project' ? collectChapters(byId, child).map((item) => item.document) : [] }));
}

// Every entity referenced across the book with which documents (and amounts) used it.
async function loadEntityIndex(documentIds, titles) {
  const mentions = await query(
    `
      select e.id, e.label, e.type, m.document_id as "documentId"
      from document_mentions m
      join entities e on e.id = m.target_id
      where m.ref_type = 'entity' and m.document_id = any($1::text[]) and e.document_id is null
      order by lower(e.label), m.document_id
    `,
    [documentIds]
  );
  const usages = await query('select target_id as "targetId", document_id as "documentId", quantities from document_usages where document_id = any($1::text[])', [
    documentIds
  ]);
  const amounts = new Map();
  for (const usage of usages.rows) {
    const key = `${usage.targetId}:${usage.documentId}`;
    amounts.set(key, [...(amounts.get(key) ?? []), ...(usage.quantities ?? []).map(formatQuantity)]);
  }

  const rows = new Map();
  for (const mention of mentions.rows) {
    const row = rows.get(mention.id) ?? { label: mention.label, type: mention.type, uses: [] };
    const amountText = amounts.get(`${mention.id}:${mention.documentId}`)?.join(', ');
    row.uses.push(`${titles.get(mention.documentId) ?? mention.documentId}${amountText ? ` (${amountText})` : ''}`);
    rows.set(mention.id, row);
  }
  return [...rows.values()];
}

async function loadBookContext(documentId) {
  const byId = await loadAllDocuments();
  const root = byId.get(documentId);
  if (!root) {
    return null;
  }

  const tree = collectChapters(byId, root);
  const leaves = tree.flatMap((item) => (item.children.length > 0 ? item.children : item.document.kind === 'experiment' ? [item.document] : []));
  const documentIds = leaves.map((document) => document.id);
  const entities = await loadReferencedCompounds(documentIds);
  const assets = new Map();
  const imageFiles = new Map();
  const titles = new Map(leaves.map((document) => [document.id, document.title]));

  const renderChapter = async (document, level) => {
    const [revisions, attachments] = await Promise.all([listRevisions({ query }, document.id), listAttachments({ query }, document.id)]);
    const body = renderDocumentBody(document, {
      entities,
      revision: revisions[0] ?? null,
      assets,
      resolveImage: imageResolver(attachments, imageFiles),
      headingOffset: level - 1,
      skipTitle: true
    });
    return { title: document.title, level, body };
  };

  const chapters = [];
  for (const item of tree) {
    if (item.document.kind === 'project') {
      chapters.push({ title: item.document.title, level: 1, body: renderDocumentBody(item.document, { assets, headingOffset: 1, skipTitle: true }) });
      for (const experiment of item.children) {
        chapters.push(await renderChapter(experiment, 2));
      }
    } else if (item.document.kind === 'experiment') {
      chapters.push(await renderChapter(item.document, 1));
    }
  }

  for (const [file, attachmentId] of imageFiles) {
    assets.set(file, await readAttachmentBytes(attachmentId));
  }

  const structures = [];
  for (const [id, entity] of entities) {
    const file = `structure-${id}.svg`;
    assets.set(file, entity.svg);
    structures.push({
      label: entity.label,
      file,
      meta: [entity.formula, entity.molecularWeight ? `${entity.molecularWeight} g/mol` : null].filter(Boolean).join(' · ')
    });
  }

  const dates = leaves.map(documentDate).sort();
  const source = projectToTypst({
    title: root.title,
    path: pathOf(byId, root),
    subtitle: leaves.length > 0 ? `${leaves.length} ${leaves.length === 1 ? 'experiment' : 'experiments'} · ${dates[0]} – ${dates[dates.length - 1]}` : 'No experiments yet',
    chapters,
    index: await loadEntityIndex(documentIds, titles),
    structures
  });

  return { document: root, source, assets };
}

export async function exportDocumentTypst(documentId, options = {}) {
  const context = await loadExportContext(documentId, options);
  return context ? { title: context.document.title, source: context.source } : null;
}

export async function exportProjectTypst(documentId) {
  const context = await loadBookContext(documentId);
  return context ? { title: context.document.title, source: context.source } : null;
}

export class ExportError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
}

// Compiles a Typst source plus its asset files into a PDF buffer.
export async function compileTypst(source, assets = new Map()) {
  const workDir = await mkdtemp(path.join(tmpdir(), 'labnotes-export-'));
  try {
    await writeFile(path.join(workDir, 'document.typ'), source, 'utf8');
    for (const [file, data] of assets) {
      await writeFile(path.join(workDir, file), data);
    }

    try {
      await execFileAsync(TYPST_BIN, ['compile', '--root', workDir, 'document.typ', 'document.pdf'], {
        cwd: workDir,
        timeout: 120_000
      });
    } catch (error) {
      throw new ExportError('Typst compilation failed', String(error.stderr ?? error.message));
    }

    return readFile(path.join(workDir, 'document.pdf'));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function exportDocumentPdf(documentId, options = {}) {
  const context = await loadExportContext(documentId, options);
  if (!context) {
    return null;
  }
  return { title: context.document.title, pdf: await compileTypst(context.source, context.assets) };
}

export async function exportProjectPdf(documentId) {
  const context = await loadBookContext(documentId);
  if (!context) {
    return null;
  }
  return { title: context.document.title, pdf: await compileTypst(context.source, context.assets) };
}
