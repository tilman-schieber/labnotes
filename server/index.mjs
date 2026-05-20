import cors from 'cors';
import express from 'express';
import { closePool, query, withTransaction } from './lib/database.mjs';
import { createId } from './lib/ids.mjs';
import { runMigrations } from './lib/migrations.mjs';
import { seedDatabase, syncDocumentEntities } from './lib/seed.mjs';
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
  if (!['group', 'project', 'protocol'].includes(kind)) {
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

  if (kind === 'protocol' && parent.kind !== 'project') {
    return 'Protocols must live inside projects';
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
    await syncDocumentEntities(client);
    return nextDocument;
  });

  const nextDocuments = await loadDocuments();
  response.status(201).json({ document: getDocumentWithAncestors(nextDocuments, document.id) });
});

app.patch('/api/documents/:id', async (request, response) => {
  const nextTitle = String(request.body.title ?? '').trim();
  const nextContent = request.body.content ?? null;

  const updated = await withTransaction(async (client) => {
    const result = await client.query(
      `
        update documents
        set title = $2,
            content = $3::jsonb,
            updated_at = now()
        where id = $1
        returning id
      `,
      [request.params.id, nextTitle, JSON.stringify(nextContent)]
    );

    if (result.rowCount === 0) {
      return null;
    }

    await syncDocumentEntities(client);
    return result.rows[0].id;
  });

  if (!updated) {
    response.status(404).json({ error: 'Document not found' });
    return;
  }

  const nextDocuments = await loadDocuments();
  response.json({ document: getDocumentWithAncestors(nextDocuments, updated) });
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

app.get('/api/entities/search', async (request, response) => {
  const queryText = String(request.query.q ?? '').trim().toLowerCase();
  const result = await query(
    `
      select
        e.id,
        e.label,
        e.type,
        e.subtype,
        e.status,
        e.document_id as "documentId",
        e.document_id is not null as "isDocument"
      from entities e
      where
        $1 = ''
        or lower(e.label) like '%' || $1 || '%'
        or lower(e.type) like '%' || $1 || '%'
        or exists (
          select 1
          from entity_aliases a
          where a.entity_id = e.id and lower(a.alias) like '%' || $1 || '%'
        )
      order by e.document_id is not null desc, e.updated_at desc
      limit 20
    `,
    [queryText]
  );

  response.json({
    entities: result.rows.map((entity) => ({
      id: entity.id,
      label: entity.label,
      type: entity.type,
      subtype: entity.subtype,
      status: entity.status,
      documentId: entity.documentId,
      description: entity.isDocument ? `${entity.subtype ?? entity.type} document` : entity.subtype ?? entity.type
    }))
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

  const [aliasesResult, backlinksResult] = await Promise.all([
    query(
      `
        select id, entity_id as "entityId", alias, kind, created_at as "createdAt"
        from entity_aliases
        where entity_id = $1
        order by created_at asc
      `,
      [entity.id]
    ),
    query(
      `
        select id, document_id as "documentId", ref_type as "refType", target_id as "targetId", label_snapshot as "labelSnapshot", source, created_at as "createdAt"
        from document_mentions
        where target_id = $1
        order by created_at desc
      `,
      [entity.id]
    )
  ]);

  response.json({ entity, aliases: aliasesResult.rows, backlinks: backlinksResult.rows });
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
      order by updated_at desc
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

  response.json({ user: result.rows[0] });
});

async function bootstrap() {
  if (AUTO_MIGRATE_ON_START) {
    await runMigrations();
  }

  if (AUTO_SEED_ON_START) {
    await withTransaction((client) => seedDatabase(client));
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
