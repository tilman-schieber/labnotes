import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { query } from './database.mjs';
import { listRevisions } from './revisions.mjs';
import { documentToTypst } from './typst.mjs';

const execFileAsync = promisify(execFile);
const TYPST_BIN = process.env.TYPST_BIN ?? 'typst';

let oclPromise = null;
function loadOcl() {
  if (!oclPromise) {
    oclPromise = import('openchemlib');
  }
  return oclPromise;
}

// Compound entities referenced by the document, with a rendered structure where SMILES is known.
async function loadReferencedCompounds(documentId) {
  const result = await query(
    `
      select e.id, e.attributes->>'smiles' as smiles
      from document_mentions m
      join entities e on e.id = m.target_id
      where m.document_id = $1 and m.ref_type = 'entity' and e.type = 'compound' and e.attributes ? 'smiles'
    `,
    [documentId]
  );

  const entities = new Map();
  if (result.rowCount === 0) {
    return entities;
  }

  const { Molecule } = await loadOcl();
  for (const row of result.rows) {
    try {
      const molecule = Molecule.fromSmiles(row.smiles);
      entities.set(row.id, { svg: molecule.toSVG(200, 120, undefined, { autoCrop: true, autoCropMargin: 4, suppressChiralText: true }) });
    } catch {
      // Unparseable SMILES: export without a structure.
    }
  }
  return entities;
}

async function loadExportContext(documentId) {
  const documents = await query(
    'select id, kind, parent_id as "parentId", title, content, metadata from documents order by created_at asc'
  );
  const byId = new Map(documents.rows.map((row) => [row.id, row]));
  const document = byId.get(documentId);
  if (!document) {
    return null;
  }

  const pathTitles = [];
  let current = document.parentId ? byId.get(document.parentId) : null;
  while (current) {
    pathTitles.unshift(current.title);
    current = current.parentId ? byId.get(current.parentId) : null;
  }

  const [revisions, entities] = await Promise.all([listRevisions({ query }, documentId), loadReferencedCompounds(documentId)]);
  const assets = new Map();
  const source = documentToTypst(document, { path: pathTitles, entities, revision: revisions[0] ?? null, assets });

  return { document, source, assets };
}

export async function exportDocumentTypst(documentId) {
  const context = await loadExportContext(documentId);
  return context ? { title: context.document.title, source: context.source } : null;
}

export class ExportError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
}

export async function exportDocumentPdf(documentId) {
  const context = await loadExportContext(documentId);
  if (!context) {
    return null;
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'labnotes-export-'));
  try {
    await writeFile(path.join(workDir, 'document.typ'), context.source, 'utf8');
    for (const [file, svg] of context.assets) {
      await writeFile(path.join(workDir, file), svg, 'utf8');
    }

    try {
      await execFileAsync(TYPST_BIN, ['compile', '--root', workDir, 'document.typ', 'document.pdf'], {
        cwd: workDir,
        timeout: 120_000
      });
    } catch (error) {
      throw new ExportError('Typst compilation failed', String(error.stderr ?? error.message));
    }

    return { title: context.document.title, pdf: await readFile(path.join(workDir, 'document.pdf')) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
