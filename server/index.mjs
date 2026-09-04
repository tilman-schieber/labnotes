import cors from 'cors';
import express from 'express';
import { closePool, getDialect, getPool, query, sql, withTransaction } from './lib/database.mjs';
import { MergeError, mergeEntities } from './lib/entities.mjs';
import { createId } from './lib/ids.mjs';
import { syncAllDocumentMentions, syncDocumentMentions } from './lib/mentions.mjs';
import { runMigrations } from './lib/migrations.mjs';
import { SignError, getRevision, listRevisions, recordRevision, signRevision } from './lib/revisions.mjs';
import { seedDatabase, syncDocumentEntity } from './lib/seed.mjs';
import { extractText } from './lib/text.mjs';
import { convert, findUnit, toBase } from '../src/units/quantity.ts';
import { exportDocumentPdf, exportDocumentTypst } from './lib/export.mjs';
import {
  MAX_ATTACHMENT_BYTES,
  deleteAttachment,
  deleteAttachmentFilesForDocument,
  getAttachment,
  listAttachments,
  readAttachmentBytes,
  safeFilename,
  storeAttachment
} from './lib/attachments.mjs';
import { createTemplateDocument } from './lib/templates.mjs';

const PORT = Number(process.env.PORT ?? 5174);
const AUTO_MIGRATE_ON_START = process.env.AUTO_MIGRATE_ON_START !== 'false';
const AUTO_SEED_ON_START = process.env.AUTO_SEED_ON_START !== 'false';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function buildTree(documents) {
  const nodes = new Map(documents.map((document) => [document.id, { ...document, children: [] }]));
  const roots = [];

  documents.forEach((document) => {
    const node = nodes.get(document.id);
    if (!node) {
      return;
    }

    if (!document.parentId) {
      roots.push(node);
      return;
    }

    const parent = nodes.get(document.parentId);
    if (parent) {
      parent.children.push(node);
    }
  });

  // pg returns timestamptz columns as Date objects.
  const sortNodes = (items) => {
    items.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
}

function getDocumentWithAncestors(documents, documentId) {
  const document = documents.find((item) => item.id === documentId);
  if (!document) {
    return null;
  }

  const parent = document.parentId ? documents.find((item) => item.id === document.parentId) : null;
  const grandparent = parent?.parentId ? documents.find((item) => item.id === parent.parentId) : null;

  return {
    ...document,
    groupId: document.kind === 'group' ? document.id : grandparent?.id ?? parent?.id ?? null,
    projectId: document.kind === 'project' ? document.id : parent?.kind === 'project' ? parent.id : null
  };
}

function validateDocumentPayload(documents, kind, parentId) {
  if (!['group', 'project', 'experiment'].includes(kind)) {
    return 'Unsupported document kind';
  }

  if (kind === 'group') {
    return parentId ? 'Groups cannot have a parent' : null;
  }

  const parent = documents.find((document) => document.id === parentId);
  if (!parent) {
    return `${kind} requires a valid parent document`;
  }

  if (kind === 'project' && parent.kind !== 'group') {
    return 'Projects must live inside groups';
  }

  if (kind === 'experiment' && parent.kind !== 'project') {
    return 'Experiments must live inside projects';
  }

  return null;
}

async function loadDocuments() {
  const result = await query(
    `
      select id, kind, parent_id as "parentId", title, content, metadata, created_at as "createdAt", updated_at as "updatedAt"
      from documents
      order by created_at asc
    `
  );

  return result.rows;
}

// Amounts an entity was used with, per document, plus totals per unit dimension.
async function loadUsages(entityId) {
  const result = await query(
    `
      select
        du.id,
        du.document_id as "documentId",
        d.title as "documentTitle",
        d.kind as "documentKind",
        d.metadata ->> 'date' as "documentDate",
        du.quantities,
        du.role,
        du.sentence
      from document_usages du
      join documents d on d.id = du.document_id
      where du.target_id = $1
      order by d.updated_at desc, du.block_index asc
    `,
    [entityId]
  );

  const totals = new Map();
  for (const row of result.rows) {
    for (const quantity of row.quantities ?? []) {
      const unit = findUnit(quantity.unit);
      if (!unit || unit.dimension === 'ratio' || unit.dimension === 'concentration') {
        continue;
      }
      const base = toBase(quantity);
      totals.set(unit.dimension, (totals.get(unit.dimension) ?? 0) + base);
    }
  }

  const BASE_UNIT = { mass: 'g', volume: 'L', amount: 'mol' };
  const usageTotals = [...totals.entries()].map(([dimension, base]) => {
    // Pick a readable unit: the base unit or its milli- variant.
    const baseUnit = BASE_UNIT[dimension];
    const quantity = { value: base, unit: baseUnit };
    const preferred = base < 1 && baseUnit !== 'g' ? convert(quantity, `m${baseUnit}`) : base < 1 ? convert(quantity, 'mg') : quantity;
    return { dimension, quantity: { value: Number(preferred.value.toPrecision(6)), unit: preferred.unit } };
  });

  return { usages: result.rows, usageTotals };
}

// Mentions joined with their document so callers can render backlinks without a second lookup.
async function loadBacklinks(refType, targetId) {
  const result = await query(
    `
      select
        m.id,
        m.document_id as "documentId",
        d.title as "documentTitle",
        d.kind as "documentKind",
        m.ref_type as "refType",
        m.target_id as "targetId",
        m.label_snapshot as "labelSnapshot",
        m.source,
        m.created_at as "createdAt"
      from document_mentions m
      join documents d on d.id = m.document_id
      where m.ref_type = $1 and m.target_id = $2
      order by d.updated_at desc
    `,
    [refType, targetId]
  );

  return result.rows;
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/documents/tree', async (_request, response) => {
  const documents = await loadDocuments();
  response.json({ documents: buildTree(documents) });
});

// LIKE-based fallback ranking/highlighting for backends without full-text indexing.
function countTermOccurrences(text, terms) {
  const haystack = text.toLowerCase();
  return terms.reduce((total, term) => {
    let count = 0;
    for (let at = haystack.indexOf(term); at !== -1; at = haystack.indexOf(term, at + term.length)) {
      count += 1;
    }
    return total + count;
  }, 0);
}

function makeSnippet(text, terms) {
  const source = String(text ?? '');
  if (terms.length === 0) {
    return source.slice(0, 160);
  }

  const haystack = source.toLowerCase();
  const first = Math.min(...terms.map((term) => haystack.indexOf(term)).filter((at) => at !== -1).concat([Infinity]));
  const start = first === Infinity ? 0 : Math.max(0, first - 60);
  const window = source.slice(start, start + 180);
  const highlighted = terms.reduce(
    (snippet, term) => snippet.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (match) => `[[${match}]]`),
    window
  );
  return `${start > 0 ? '… ' : ''}${highlighted}${start + 180 < source.length ? ' …' : ''}`;
}

// Search across titles, content and tags. Optional `tag` narrows to documents tagged with
// it. Postgres uses the tsvector index; SQLite matches every term as a substring.
async function searchDocuments(queryText, tag) {
  if (getDialect() === 'sqlite') {
    const terms = queryText.toLowerCase().split(/\s+/).filter(Boolean);
    const termClauses = terms.map((_term, index) => `instr(lower(d.title || ' ' || d.search_text), $${index + 3}) > 0`);
    const result = await query(
      `
        select d.id, d.kind, d.title, d.metadata, d.updated_at as "updatedAt", d.search_text as "searchText"
        from documents d
        where (${termClauses.length > 0 ? termClauses.join(' and ') : `$1 = $1`})
          and ($2 = '' or exists (select 1 from json_each(d.metadata, '$.tags') where value = $2))
        order by d.updated_at desc
        limit 50
      `,
      [queryText, tag, ...terms]
    );

    return result.rows
      .map((row) => ({ ...row, snippet: makeSnippet(row.searchText, terms) }))
      .sort(
        (left, right) =>
          countTermOccurrences(`${right.title} ${right.searchText}`, terms) -
          countTermOccurrences(`${left.title} ${left.searchText}`, terms)
      );
  }

  const result = await query(
    `
      select
        d.id,
        d.kind,
        d.title,
        d.metadata,
        d.updated_at as "updatedAt",
        case when $1 = '' then null else ts_rank(d.search_tsv, websearch_to_tsquery('simple', $1)) end as rank,
        case when $1 = '' then left(d.search_text, 160)
             else ts_headline('simple', d.search_text, websearch_to_tsquery('simple', $1),
                              'MaxWords=24, MinWords=12, StartSel=[[, StopSel=]], MaxFragments=2, FragmentDelimiter=" … "')
        end as snippet
      from documents d
      where ($1 = '' or d.search_tsv @@ websearch_to_tsquery('simple', $1))
        and ($2 = '' or d.metadata -> 'tags' ? $2)
      order by rank desc nulls last, d.updated_at desc
      limit 50
    `,
    [queryText, tag]
  );
  return result.rows;
}

app.get('/api/search', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim();
  const tag = String(request.query.tag ?? '').trim().toLowerCase();

  if (!queryText && !tag) {
    response.json({ results: [] });
    return;
  }

  const rows = await searchDocuments(queryText, tag);

  const documents = await loadDocuments();
  const byId = new Map(documents.map((document) => [document.id, document]));
  const pathOf = (id) => {
    const titles = [];
    let current = byId.get(id)?.parentId ? byId.get(byId.get(id).parentId) : null;
    while (current) {
      titles.unshift(current.title);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return titles;
  };

  response.json({
    results: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      path: pathOf(row.id),
      status: row.metadata?.status ?? null,
      tags: row.metadata?.tags ?? [],
      snippet: row.snippet ?? '',
      updatedAt: row.updatedAt
    }))
  });
});

// `/` lookup: documents with their tree path, resolved to the mirrored document entity id.
app.get('/api/documents/search', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim().toLowerCase();
  const documents = await loadDocuments();
  const byId = new Map(documents.map((document) => [document.id, document]));

  const pathOf = (document) => {
    const titles = [];
    let current = document.parentId ? byId.get(document.parentId) : null;
    while (current) {
      titles.unshift(current.title);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
    return titles;
  };

  const matches = documents
    .filter((document) => !queryText || document.title.toLowerCase().includes(queryText))
    .sort((left, right) => {
      const leftPrefix = left.title.toLowerCase().startsWith(queryText) ? 0 : 1;
      const rightPrefix = right.title.toLowerCase().startsWith(queryText) ? 0 : 1;
      return leftPrefix - rightPrefix || new Date(right.updatedAt) - new Date(left.updatedAt);
    })
    .slice(0, 20)
    .map((document) => ({
      id: document.id,
      entityId: `document-${document.id}`,
      title: document.title,
      kind: document.kind,
      path: pathOf(document)
    }));

  response.json({ documents: matches });
});

app.get('/api/documents/:id', async (request, response) => {
  const documents = await loadDocuments();
  const document = getDocumentWithAncestors(documents, request.params.id);

  if (!document) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  response.json({ document });
});

app.get('/api/documents/:id/mentions', async (request, response) => {
  const result = await query(
    `
      select
        m.id,
        m.ref_type as "refType",
        m.target_id as "targetId",
        m.label_snapshot as "labelSnapshot",
        m.source,
        m.created_at as "createdAt",
        coalesce(e.label, u.display_name) as "currentLabel",
        e.type as "entityType",
        e.document_id as "entityDocumentId",
        ${sql.mentionQuantities()} as quantities,
        (select du.role from document_usages du where du.document_id = m.document_id and du.target_id = m.target_id and du.role is not null limit 1) as role
      from document_mentions m
      left join entities e on m.ref_type = 'entity' and e.id = m.target_id
      left join users u on m.ref_type = 'user' and u.id = m.target_id
      where m.document_id = $1
      order by m.created_at asc
    `,
    [request.params.id]
  );

  if (result.rowCount === 0) {
    const exists = await query('select 1 from documents where id = $1', [request.params.id]);
    if (exists.rowCount === 0) {
      response.status(404).json({ error: 'Document not found' });
      return;
    }
  }

  response.json({ mentions: result.rows });
});

app.get('/api/documents/:id/usages', async (request, response) => {
  const exists = await query('select 1 from documents where id = $1', [request.params.id]);
  if (exists.rowCount === 0) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  const result = await query(
    `
      select id, target_id as "targetId", label, entity_type as "entityType", quantities, role, block_index as "blockIndex", sentence
      from document_usages
      where document_id = $1
      order by block_index asc, created_at asc
    `,
    [request.params.id]
  );
  response.json({ usages: result.rows });
});

app.post('/api/documents', async (request, response) => {
  const documents = await loadDocuments();
  const kind = String(request.body.kind ?? '');
  const parentId = request.body.parentId ?? null;
  const title = String(request.body.title ?? '').trim();
  const validationError = validateDocumentPayload(documents, kind, parentId);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  const document = await withTransaction(async (client) => {
    const nextDocument = {
      id: createId(kind),
      kind,
      parentId,
      title: title || `Untitled ${kind}`,
      content: request.body.content ?? createTemplateDocument(kind, title || `Untitled ${kind}`)
    };

    await client.query(
      `
        insert into documents (id, kind, parent_id, title, content, search_text)
        values ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [
        nextDocument.id,
        nextDocument.kind,
        nextDocument.parentId,
        nextDocument.title,
        JSON.stringify(nextDocument.content),
        extractText(nextDocument.content)
      ]
    );
    await syncDocumentEntity(client, nextDocument.id);
    await syncDocumentMentions(client, nextDocument.id, nextDocument.content);
    await recordRevision(client, nextDocument.id, { title: nextDocument.title, content: nextDocument.content, coalesce: false });
    return nextDocument;
  });

  const nextDocuments = await loadDocuments();
  response.status(201).json({ document: getDocumentWithAncestors(nextDocuments, document.id) });
});

const DOCUMENT_STATUSES = ['planned', 'in_progress', 'done', 'failed', 'abandoned'];

function normalizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const metadata = {};
  if (DOCUMENT_STATUSES.includes(input.status)) {
    metadata.status = input.status;
  }
  if (typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    metadata.date = input.date;
  }
  if (Array.isArray(input.tags)) {
    const tags = [...new Set(input.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
    if (tags.length > 0) {
      metadata.tags = tags;
    }
  }
  return metadata;
}

app.patch('/api/documents/:id', async (request, response) => {
  // Metadata-only updates do not touch content and never create a revision.
  if (request.body.content === undefined && request.body.metadata !== undefined) {
    const result = await query('update documents set metadata = $2::jsonb where id = $1 returning id', [
      request.params.id,
      JSON.stringify(normalizeMetadata(request.body.metadata))
    ]);
    if (result.rowCount === 0) {
      response.status(404).json({ error: 'Document not found' });
      return;
    }
    const nextDocuments = await loadDocuments();
    response.json({ document: getDocumentWithAncestors(nextDocuments, request.params.id) });
    return;
  }

  const nextTitle = String(request.body.title ?? '').trim();
  const nextContent = request.body.content ?? null;

  const updated = await withTransaction(async (client) => {
    // Compare in SQL so jsonb key-order normalisation does not produce spurious revisions.
    const currentResult = await client.query(
      `
        select title = $2 and content = $3::jsonb as unchanged
        from documents
        where id = $1
        for update
      `,
      [request.params.id, nextTitle, JSON.stringify(nextContent)]
    );

    if (currentResult.rowCount === 0) {
      return null;
    }

    if (currentResult.rows[0].unchanged) {
      return request.params.id;
    }

    await client.query(
      `
        update documents
        set title = $2,
            content = $3::jsonb,
            search_text = $4,
            updated_at = now()
        where id = $1
      `,
      [request.params.id, nextTitle, JSON.stringify(nextContent), extractText(nextContent)]
    );

    await syncDocumentEntity(client, request.params.id);
    await syncDocumentMentions(client, request.params.id, nextContent);
    await recordRevision(client, request.params.id, { title: nextTitle, content: nextContent });
    return request.params.id;
  });

  if (!updated) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  const nextDocuments = await loadDocuments();
  response.json({ document: getDocumentWithAncestors(nextDocuments, updated) });
});

function exportFilename(title, extension) {
  const base = String(title).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'document';
  return `${base}.${extension}`;
}

app.get('/api/documents/:id/export.typ', async (request, response) => {
  const result = await exportDocumentTypst(request.params.id);
  if (!result) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Content-Disposition', `inline; filename="${exportFilename(result.title, 'typ')}"`);
  response.send(result.source);
});

app.get('/api/documents/:id/export.pdf', async (request, response) => {
  try {
    const result = await exportDocumentPdf(request.params.id);
    if (!result) {
      response.status(404).json({ error: 'Document not found' });
      return;
    }

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${exportFilename(result.title, 'pdf')}"`);
    response.send(result.pdf);
  } catch (error) {
    if (error?.detail !== undefined) {
      response.status(500).json({ error: error.message, detail: error.detail });
      return;
    }
    throw error;
  }
});

app.get('/api/documents/:id/revisions', async (request, response) => {
  const exists = await query('select 1 from documents where id = $1', [request.params.id]);
  if (exists.rowCount === 0) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  const revisions = await listRevisions(getPool(), request.params.id);
  response.json({ revisions });
});

app.get('/api/documents/:id/revisions/:revision', async (request, response) => {
  const revision = await getRevision(getPool(), request.params.id, Number(request.params.revision));
  if (!revision) {
    response.status(404).json({ error: 'Revision not found' });
    return;
  }

  response.json({ revision });
});

app.post('/api/documents/:id/revisions/:revision/sign', async (request, response) => {
  const userId = String(request.body.userId ?? '').trim();
  if (!userId) {
    response.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const revision = await withTransaction((client) =>
      signRevision(client, request.params.id, Number(request.params.revision), {
        userId,
        note: request.body.note ? String(request.body.note) : null
      })
    );
    response.json({ revision });
  } catch (error) {
    if (error instanceof SignError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

// Restoring writes the old snapshot as the current content and records it as a new revision,
// so history stays append-only.
app.post('/api/documents/:id/revisions/:revision/restore', async (request, response) => {
  const restored = await withTransaction(async (client) => {
    const revision = await getRevision(client, request.params.id, Number(request.params.revision));
    if (!revision) {
      return null;
    }

    await client.query(
      `
        update documents
        set title = $2,
            content = $3::jsonb,
            search_text = $4,
            updated_at = now()
        where id = $1
      `,
      [request.params.id, revision.title, JSON.stringify(revision.content), extractText(revision.content)]
    );

    await syncDocumentEntity(client, request.params.id);
    await syncDocumentMentions(client, request.params.id, revision.content);
    await recordRevision(client, request.params.id, { title: revision.title, content: revision.content, coalesce: false });
    return revision;
  });

  if (!restored) {
    response.status(404).json({ error: 'Revision not found' });
    return;
  }

  const nextDocuments = await loadDocuments();
  response.json({ document: getDocumentWithAncestors(nextDocuments, request.params.id) });
});

app.get('/api/documents/:id/attachments', async (request, response) => {
  const exists = await query('select 1 from documents where id = $1', [request.params.id]);
  if (exists.rowCount === 0) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }
  response.json({ attachments: await listAttachments({ query }, request.params.id) });
});

// Raw upload: body is the file, name comes from X-Filename (URL-encoded) or ?filename=.
app.post(
  '/api/documents/:id/attachments',
  express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }),
  async (request, response) => {
    const exists = await query('select 1 from documents where id = $1', [request.params.id]);
    if (exists.rowCount === 0) {
      response.status(404).json({ error: 'Document not found' });
      return;
    }

    const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (bytes.length === 0) {
      response.status(400).json({ error: 'Empty upload' });
      return;
    }

    const headerName = request.get('x-filename');
    const filename = safeFilename(headerName ? decodeURIComponent(headerName) : String(request.query.filename ?? 'file'));
    const attachment = await withTransaction((client) =>
      storeAttachment(client, request.params.id, { filename, mimeType: request.get('content-type'), bytes })
    );
    response.status(201).json({ attachment });
  }
);

app.get('/api/attachments/:id', async (request, response) => {
  const attachment = await getAttachment({ query }, request.params.id);
  if (!attachment) {
    response.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const bytes = await readAttachmentBytes(attachment.id);
  const disposition = request.query.download !== undefined ? 'attachment' : 'inline';
  response.setHeader('Content-Type', attachment.mimeType);
  response.setHeader('Content-Length', String(bytes.length));
  response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
  response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  response.send(bytes);
});

app.delete('/api/attachments/:id', async (request, response) => {
  const deleted = await withTransaction((client) => deleteAttachment(client, request.params.id));
  if (!deleted) {
    response.status(404).json({ error: 'Attachment not found' });
    return;
  }
  response.status(204).end();
});

app.delete('/api/documents/:id', async (request, response) => {
  const deleted = await withTransaction(async (client) => {
    await deleteAttachmentFilesForDocument(client, request.params.id);
    const result = await client.query('delete from documents where id = $1', [request.params.id]);
    return result.rowCount > 0;
  });

  if (!deleted) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  response.status(204).end();
});

// Ids of the documents that share a project with `documentId` (the project itself and its
// experiments); for a group, all documents in the group. Used to boost recently used entities.
function getContextDocumentIds(documents, documentId) {
  const document = documentId ? getDocumentWithAncestors(documents, documentId) : null;
  if (!document) {
    return [];
  }

  const scopeId = document.projectId ?? document.groupId;
  return documents
    .filter((item) => item.id === scopeId || getDocumentWithAncestors(documents, item.id)?.[document.projectId ? 'projectId' : 'groupId'] === scopeId)
    .map((item) => item.id);
}

const TEMPLATE_COLUMNS = 'id, name, kind, created_at as "createdAt", updated_at as "updatedAt"';

app.get('/api/templates', async (request, response) => {
  const kind = String(request.query.kind ?? '').trim();
  const result = await query(
    `select ${TEMPLATE_COLUMNS} from templates where $1 = '' or kind = $1 order by lower(name) asc`,
    [kind]
  );
  response.json({ templates: result.rows });
});

app.get('/api/templates/:id', async (request, response) => {
  const result = await query(`select ${TEMPLATE_COLUMNS}, content from templates where id = $1`, [request.params.id]);
  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Template not found' });
    return;
  }
  response.json({ template: result.rows[0] });
});

// Create from explicit content, or snapshot an existing document's content.
app.post('/api/templates', async (request, response) => {
  const name = String(request.body.name ?? '').trim();
  if (!name) {
    response.status(400).json({ error: 'name is required' });
    return;
  }

  let kind = String(request.body.kind ?? 'experiment');
  let content = request.body.content ?? null;

  if (request.body.documentId) {
    const documentResult = await query('select kind, content from documents where id = $1', [String(request.body.documentId)]);
    if (documentResult.rowCount === 0) {
      response.status(404).json({ error: 'Document not found' });
      return;
    }
    kind = documentResult.rows[0].kind;
    content = documentResult.rows[0].content;
  }

  if (!content || typeof content !== 'object') {
    response.status(400).json({ error: 'content or documentId is required' });
    return;
  }

  const result = await query(
    `insert into templates (id, name, kind, content) values ($1, $2, $3, $4::jsonb) returning ${TEMPLATE_COLUMNS}`,
    [createId('template'), name, kind, JSON.stringify(content)]
  );
  response.status(201).json({ template: result.rows[0] });
});

app.delete('/api/templates/:id', async (request, response) => {
  const result = await query('delete from templates where id = $1', [request.params.id]);
  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Template not found' });
    return;
  }
  response.status(204).end();
});

// Names the editor should recognise in plain text: labels and aliases of live, non-document entities.
app.get('/api/entities/labels', async (_request, response) => {
  const result = await query(
    `
      select e.id, e.type, e.label,
        ${sql.aliasList()} as aliases
      from entities e
      left join entity_aliases a on a.entity_id = e.id and a.kind <> 'title'
      where e.status <> 'archived' and e.document_id is null
      group by e.id
      order by e.label
    `
  );
  response.json({ entities: result.rows });
});

app.get('/api/entities/search', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim().toLowerCase();
  const typeFilter = String(request.query.type ?? '').trim();
  const contextDocumentId = String(request.query.documentId ?? '').trim();
  const contextIds = contextDocumentId ? getContextDocumentIds(await loadDocuments(), contextDocumentId) : [];

  const result = await query(
    `
      select
        e.id,
        e.label,
        e.type,
        e.subtype,
        e.status,
        e.document_id as "documentId",
        e.document_id is not null as "isDocument",
        e.attributes->>'smiles' as smiles,
        e.last_used is not null as "usedInContext"
      from (
        select e.*, (
          select max(m.created_at)
          from document_mentions m
          where m.ref_type = 'entity' and m.target_id = e.id and m.document_id = any($2::text[])
        ) as last_used
        from entities e
      ) e
      where
        e.status <> 'archived'
        and ($3 = '' or e.type = $3)
        and (
          $1 = ''
          or lower(e.label) like '%' || $1 || '%'
          or lower(e.type) like '%' || $1 || '%'
          or exists (
            select 1
            from entity_aliases a
            where a.entity_id = e.id and lower(a.alias) like '%' || $1 || '%'
          )
          or lower(e.attributes->>'casNumber') = $1
          or lower(e.attributes->>'formula') = $1
        )
      order by
        e.last_used is not null desc,
        ($1 <> '' and lower(e.label) like $1 || '%') desc,
        case when $1 = '' then 0 else ${sql.similarity('lower(e.label)', '$1')} end desc,
        e.last_used desc nulls last,
        e.document_id is not null desc,
        e.updated_at desc
      limit 20
    `,
    [queryText, contextIds, typeFilter]
  );

  response.json({
    entities: result.rows.map((entity) => {
      const base = entity.isDocument ? `${entity.subtype ?? entity.type} document` : entity.subtype ?? entity.type;
      return {
        id: entity.id,
        label: entity.label,
        type: entity.type,
        subtype: entity.subtype,
        status: entity.status,
        documentId: entity.documentId,
        smiles: entity.smiles,
        usedInContext: entity.usedInContext,
        description: [base, entity.status === 'draft' ? 'draft' : null, entity.usedInContext ? 'used in this project' : null]
          .filter(Boolean)
          .join(' · ')
      };
    })
  });
});

// Registry listing: broader than /search (includes archived, no limit-20 ranking) with mention counts.
app.get('/api/entities', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim().toLowerCase();
  const typeFilter = String(request.query.type ?? '').trim();
  const statusFilter = String(request.query.status ?? '').trim();

  const result = await query(
    `
      select
        e.id,
        e.type,
        e.subtype,
        e.label,
        e.status,
        e.document_id as "documentId",
        e.attributes,
        e.created_at as "createdAt",
        e.updated_at as "updatedAt",
        (select count(*)::int from document_mentions m where m.ref_type = 'entity' and m.target_id = e.id) as "mentionCount"
      from entities e
      where
        ($2 = '' or e.type = $2)
        and ($3 = '' or e.status = $3)
        and (
          $1 = ''
          or lower(e.label) like '%' || $1 || '%'
          or exists (
            select 1 from entity_aliases a
            where a.entity_id = e.id and lower(a.alias) like '%' || $1 || '%'
          )
          -- structure identifiers on compounds: exact matches only
          or e.attributes->>'idCode' = $4
          or lower(e.attributes->>'smiles') = $1
          or lower(e.attributes->>'casNumber') = $1
        )
      order by
        ($1 <> '' and lower(e.label) like $1 || '%') desc,
        e.document_id is null desc,
        lower(e.label) asc
      limit 200
    `,
    [queryText, typeFilter, statusFilter, String(request.query.q ?? '').trim()]
  );

  const typesResult = await query('select distinct type from entities order by type');
  response.json({ entities: result.rows, types: typesResult.rows.map((row) => row.type) });
});

app.get('/api/entities/:id', async (request, response) => {
  const entityResult = await query(
    `
      select
        id,
        type,
        subtype,
        label,
        status,
        document_id as "documentId",
        attributes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from entities
      where id = $1
    `,
    [request.params.id]
  );

  const entity = entityResult.rows[0] ?? null;
  if (!entity) {
    response.status(404).json({ error: 'Entity not found' });
    return;
  }

  const [aliasesResult, backlinks, relations, usage] = await Promise.all([
    query(
      `
        select id, entity_id as "entityId", alias, kind, created_at as "createdAt"
        from entity_aliases
        where entity_id = $1
        order by created_at asc
      `,
      [entity.id]
    ),
    loadBacklinks('entity', entity.id),
    loadRelations(entity.id),
    loadUsages(entity.id)
  ]);

  response.json({ entity, aliases: aliasesResult.rows, backlinks, relations, usages: usage.usages, usageTotals: usage.usageTotals });
});

// Relations touching an entity, in both directions, with the other side resolved for display.
async function loadRelations(entityId) {
  const result = await query(
    `
      select
        r.id,
        r.predicate,
        r.subject_entity_id as "subjectEntityId",
        s.label as "subjectLabel",
        s.type as "subjectType",
        r.object_entity_id as "objectEntityId",
        o.label as "objectLabel",
        o.type as "objectType",
        r.confidence,
        r.source_document_id as "sourceDocumentId",
        d.title as "sourceDocumentTitle",
        r.created_at as "createdAt"
      from entity_relations r
      join entities s on s.id = r.subject_entity_id
      join entities o on o.id = r.object_entity_id
      left join documents d on d.id = r.source_document_id
      where r.subject_entity_id = $1 or r.object_entity_id = $1
      order by r.created_at asc
    `,
    [entityId]
  );

  return result.rows;
}

app.post('/api/entities/:id/relations', async (request, response) => {
  const predicate = String(request.body.predicate ?? '').trim();
  const objectEntityId = String(request.body.objectEntityId ?? '').trim();
  const sourceDocumentId = request.body.sourceDocumentId ? String(request.body.sourceDocumentId) : null;

  if (!predicate || !objectEntityId) {
    response.status(400).json({ error: 'predicate and objectEntityId are required' });
    return;
  }

  if (objectEntityId === request.params.id) {
    response.status(400).json({ error: 'An entity cannot relate to itself' });
    return;
  }

  const entities = await query('select id from entities where id = any($1::text[])', [[request.params.id, objectEntityId]]);
  if (entities.rowCount !== 2) {
    response.status(404).json({ error: 'Entity not found' });
    return;
  }

  const result = await query(
    `
      insert into entity_relations (id, subject_entity_id, predicate, object_entity_id, confidence, source_document_id)
      values ($1, $2, $3, $4, $5, $6)
      on conflict ${sql.relationConflictTarget()} do nothing
      returning id
    `,
    [createId('relation'), request.params.id, predicate, objectEntityId, request.body.confidence ?? null, sourceDocumentId]
  );

  if (result.rowCount === 0) {
    response.status(409).json({ error: 'Relation already exists' });
    return;
  }

  const relations = await loadRelations(request.params.id);
  response.status(201).json({ relation: relations.find((relation) => relation.id === result.rows[0].id) ?? null });
});

app.delete('/api/entities/:id/relations/:relationId', async (request, response) => {
  const result = await query(
    'delete from entity_relations where id = $1 and (subject_entity_id = $2 or object_entity_id = $2)',
    [request.params.relationId, request.params.id]
  );

  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Relation not found' });
    return;
  }

  response.status(204).end();
});

app.post('/api/entities', async (request, response) => {
  const entityId = createId('entity');
  const result = await query(
    `
      insert into entities (id, type, subtype, label, status, attributes)
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning id, type, subtype, label, status, document_id as "documentId", attributes, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [
      entityId,
      String(request.body.type ?? 'sample'),
      request.body.subtype ?? null,
      String(request.body.label ?? '').trim() || 'Untitled Entity',
      String(request.body.status ?? 'verified'),
      JSON.stringify(request.body.attributes ?? {})
    ]
  );

  response.status(201).json({ entity: result.rows[0] });
});

app.patch('/api/entities/:id', async (request, response) => {
  const result = await query(
    `
      update entities
      set type = $2,
          subtype = $3,
          label = $4,
          status = $5,
          attributes = $6::jsonb,
          updated_at = now()
      where id = $1
      returning id, type, subtype, label, status, document_id as "documentId", attributes, created_at as "createdAt", updated_at as "updatedAt"
    `,
    [
      request.params.id,
      String(request.body.type ?? 'sample'),
      request.body.subtype ?? null,
      String(request.body.label ?? '').trim() || 'Untitled Entity',
      String(request.body.status ?? 'verified'),
      JSON.stringify(request.body.attributes ?? {})
    ]
  );

  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Entity not found' });
    return;
  }

  response.json({ entity: result.rows[0] });
});

app.post('/api/entities/:id/aliases', async (request, response) => {
  const alias = String(request.body.alias ?? '').trim();
  if (!alias) {
    response.status(400).json({ error: 'Alias is required' });
    return;
  }

  const entityResult = await query('select id from entities where id = $1', [request.params.id]);
  if (entityResult.rowCount === 0) {
    response.status(404).json({ error: 'Entity not found' });
    return;
  }

  const result = await query(
    `
      insert into entity_aliases (id, entity_id, alias, kind)
      values ($1, $2, $3, $4)
      on conflict (entity_id, alias) do update
      set kind = excluded.kind
      returning id, entity_id as "entityId", alias, kind, created_at as "createdAt"
    `,
    [createId('alias'), request.params.id, alias, String(request.body.kind ?? 'synonym')]
  );

  response.status(201).json({ alias: result.rows[0] });
});

app.post('/api/entities/:id/merge', async (request, response) => {
  const sourceId = String(request.body.sourceId ?? '').trim();
  if (!sourceId) {
    response.status(400).json({ error: 'sourceId is required' });
    return;
  }

  try {
    const result = await withTransaction((client) => mergeEntities(client, request.params.id, sourceId));
    response.json(result);
  } catch (error) {
    if (error instanceof MergeError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

app.delete('/api/entities/:id/aliases/:aliasId', async (request, response) => {
  const result = await query('delete from entity_aliases where id = $1 and entity_id = $2', [
    request.params.aliasId,
    request.params.id
  ]);

  if (result.rowCount === 0) {
    response.status(404).json({ error: 'Alias not found' });
    return;
  }

  response.status(204).end();
});

app.get('/api/users/search', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim().toLowerCase();
  const result = await query(
    `
      select id, display_name as label, email, status
      from users
      where
        $1 = ''
        or lower(display_name) like '%' || $1 || '%'
        or lower(coalesce(email, '')) like '%' || $1 || '%'
      order by
        ($1 <> '' and lower(display_name) like $1 || '%') desc,
        case when $1 = '' then 0 else ${sql.similarity('lower(display_name)', '$1')} end desc,
        updated_at desc
      limit 20
    `,
    [queryText]
  );

  response.json({ users: result.rows });
});

app.get('/api/users/:id', async (request, response) => {
  const result = await query(
    `
      select id, display_name as "displayName", email, status, created_at as "createdAt", updated_at as "updatedAt"
      from users
      where id = $1
    `,
    [request.params.id]
  );

  if (result.rowCount === 0) {
    response.status(404).json({ error: 'User not found' });
    return;
  }

  const backlinks = await loadBacklinks('user', result.rows[0].id);
  response.json({ user: result.rows[0], backlinks });
});

// Documents written before full-text indexing existed (or by older extractors) get their text refreshed.
async function backfillSearchText(client) {
  const result = await client.query("select id, content from documents where search_text = ''");
  for (const row of result.rows) {
    await client.query('update documents set search_text = $2 where id = $1', [row.id, extractText(row.content)]);
  }
}

async function bootstrap() {
  if (AUTO_MIGRATE_ON_START) {
    await runMigrations();
  }

  if (AUTO_SEED_ON_START) {
    await withTransaction(async (client) => {
      await seedDatabase(client);
      // Backfills mentions for content saved before indexing existed and repairs any drift.
      await syncAllDocumentMentions(client);
      await backfillSearchText(client);
    });
  }
}

bootstrap()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Labnotes backend listening on http://localhost:${PORT}`);
    });
  })
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
