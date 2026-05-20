import { createId } from './ids.mjs';
import { createTemplateDocument } from './templates.mjs';

async function upsertDocumentEntity(client, document) {
  const attributes = {
    kind: document.kind,
    parentDocumentId: document.parent_id
  };

  const entityId = `document-${document.id}`;

  await client.query(
    `
      insert into entities (id, type, subtype, label, status, document_id, attributes)
      values ($1, 'document', $2, $3, 'verified', $4, $5::jsonb)
      on conflict (document_id) do update
      set type = excluded.type,
          subtype = excluded.subtype,
          label = excluded.label,
          status = excluded.status,
          attributes = excluded.attributes,
          updated_at = now()
    `,
    [entityId, document.kind, document.title, document.id, JSON.stringify(attributes)]
  );

  await client.query(
    `delete from entity_aliases where entity_id = $1 and kind = 'title'`,
    [entityId]
  );
  await client.query(
    `
      insert into entity_aliases (id, entity_id, alias, kind)
      values ($1, $2, $3, 'title')
      on conflict (entity_id, alias) do nothing
    `,
    [createId('alias'), entityId, document.title]
  );
}

export async function syncDocumentEntities(client) {
  const documentsResult = await client.query(
    'select id, kind, parent_id, title from documents order by created_at asc'
  );

  const currentDocumentIds = new Set(documentsResult.rows.map((row) => row.id));
  const documentEntitiesResult = await client.query(
    `select id, document_id from entities where document_id is not null`
  );

  for (const entity of documentEntitiesResult.rows) {
    if (!currentDocumentIds.has(entity.document_id)) {
      await client.query('delete from entities where id = $1', [entity.id]);
    }
  }

  for (const document of documentsResult.rows) {
    await upsertDocumentEntity(client, document);
  }
}

export async function seedDatabase(client) {
  const existingDocuments = await client.query('select count(*)::int as count from documents');
  const documentCount = existingDocuments.rows[0]?.count ?? 0;

  if (documentCount > 0) {
    await syncDocumentEntities(client);
    return false;
  }

  const groupId = createId('group');
  const projectId = createId('project');
  const protocolId = createId('protocol');
  const userId = createId('user');
  const sampleId = createId('entity');
  const reagentId = createId('entity');
  const compoundId = createId('entity');

  await client.query(
    `
      insert into documents (id, kind, parent_id, title, content)
      values
        ($1, 'group', null, 'Default Group', $2::jsonb),
        ($3, 'project', $1, 'General', $4::jsonb),
        ($5, 'protocol', $3, 'Untitled Protocol', $6::jsonb)
    `,
    [
      groupId,
      JSON.stringify(createTemplateDocument('group', 'Default Group')),
      projectId,
      JSON.stringify(createTemplateDocument('project', 'General')),
      protocolId,
      JSON.stringify(createTemplateDocument('protocol', 'Untitled Protocol'))
    ]
  );

  await client.query(
    `
      insert into users (id, display_name, email, status)
      values ($1, 'Researcher', 'researcher@example.com', 'active')
      on conflict (email) do nothing
    `,
    [userId]
  );

  await client.query(
    `
      insert into entities (id, type, subtype, label, status, document_id, attributes)
      values
        ($1, 'sample', 'specimen', 'Sample A', 'verified', null, $2::jsonb),
        ($3, 'reagent', null, 'Lysis Buffer', 'verified', null, $4::jsonb),
        ($5, 'compound', null, 'Compound X', 'verified', null, $6::jsonb)
    `,
    [
      sampleId,
      JSON.stringify({ organism: 'mouse', subjectId: 'M-001' }),
      reagentId,
      JSON.stringify({ vendor: 'Acme Bio', catalogNumber: 'LB-100' }),
      compoundId,
      JSON.stringify({ casNumber: '50-00-0' })
    ]
  );

  await client.query(
    `
      insert into entity_aliases (id, entity_id, alias, kind)
      values
        ($1, $2, 'Specimen A', 'synonym'),
        ($3, $4, 'Buffer', 'short_name'),
        ($5, $6, 'Cmpd X', 'short_name')
    `,
    [
      createId('alias'),
      sampleId,
      createId('alias'),
      reagentId,
      createId('alias'),
      compoundId
    ]
  );

  await syncDocumentEntities(client);
  return true;
}
