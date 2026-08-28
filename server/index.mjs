import cors from 'cors';
import express from 'express';
import { closePool, getPool, query, withTransaction } from './lib/database.mjs';
import { createId } from './lib/ids.mjs';
import { syncAllDocumentMentions, syncDocumentMentions } from './lib/mentions.mjs';
import { runMigrations } from './lib/migrations.mjs';
import { getRevision, listRevisions, recordRevision } from './lib/revisions.mjs';
import { seedDatabase, syncDocumentEntity } from './lib/seed.mjs';
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

  const sortNodes = (items) => {
    items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
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
      select id, kind, parent_id as "parentId", title, content, created_at as "createdAt", updated_at as "updatedAt"
      from documents
      order by created_at asc
    `
  );

  return result.rows;
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
        e.document_id as "entityDocumentId"
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
        insert into documents (id, kind, parent_id, title, content)
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [nextDocument.id, nextDocument.kind, nextDocument.parentId, nextDocument.title, JSON.stringify(nextDocument.content)]
    );
    await syncDocumentEntity(client, nextDocument.id);
    await syncDocumentMentions(client, nextDocument.id, nextDocument.content);
    await recordRevision(client, nextDocument.id, { title: nextDocument.title, content: nextDocument.content, coalesce: false });
    return nextDocument;
  });

  const nextDocuments = await loadDocuments();
  response.status(201).json({ document: getDocumentWithAncestors(nextDocuments, document.id) });
});

app.patch('/api/documents/:id', async (request, response) => {
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
            updated_at = now()
        where id = $1
      `,
      [request.params.id, nextTitle, JSON.stringify(nextContent)]
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
            updated_at = now()
        where id = $1
      `,
      [request.params.id, revision.title, JSON.stringify(revision.content)]
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

app.delete('/api/documents/:id', async (request, response) => {
  const deleted = await withTransaction(async (client) => {
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
        ctx.last_used is not null as "usedInContext"
      from entities e
      left join lateral (
        select max(m.created_at) as last_used
        from document_mentions m
        where m.ref_type = 'entity' and m.target_id = e.id and m.document_id = any($2::text[])
      ) ctx on true
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
        )
      order by
        ctx.last_used is not null desc,
        ($1 <> '' and lower(e.label) like $1 || '%') desc,
        case when $1 = '' then 0 else similarity(lower(e.label), $1) end desc,
        ctx.last_used desc nulls last,
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
        usedInContext: entity.usedInContext,
        description: entity.usedInContext ? `${base} · used in this project` : base
      };
    })
  });
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

  const [aliasesResult, backlinks] = await Promise.all([
    query(
      `
        select id, entity_id as "entityId", alias, kind, created_at as "createdAt"
        from entity_aliases
        where entity_id = $1
        order by created_at asc
      `,
      [entity.id]
    ),
    loadBacklinks('entity', entity.id)
  ]);

  response.json({ entity, aliases: aliasesResult.rows, backlinks });
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
        case when $1 = '' then 0 else similarity(lower(display_name), $1) end desc,
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

async function bootstrap() {
  if (AUTO_MIGRATE_ON_START) {
    await runMigrations();
  }

  if (AUTO_SEED_ON_START) {
    await withTransaction(async (client) => {
      await seedDatabase(client);
      // Backfills mentions for content saved before indexing existed and repairs any drift.
      await syncAllDocumentMentions(client);
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
