// Loads a fixture dataset (see demo.mjs) into the database the way the app would have written
// it: documents with revisions and derived mentions, usages, results and relations; entities
// with aliases; templates; users. Everything is marked with the dataset's name so it can be
// removed or reloaded without touching the rest of the notebook.
import { createId } from '../ids.mjs';
import { extractText } from '../text.mjs';
import { recordRevision } from '../revisions.mjs';
import { syncDocumentEntity } from '../seed.mjs';
import { syncDocumentMentions } from '../mentions.mjs';

export async function hasFixtures(client, name) {
  const result = await client.query(`select count(*)::int as count from documents where metadata ->> 'fixture' = $1`, [name]);
  return (result.rows[0]?.count ?? 0) > 0;
}

export async function removeFixtures(client, name) {
  // Children of fixture groups go with them (parent_id cascades); mentions, usages, results
  // and revisions cascade from the documents, relations and aliases from the entities.
  await client.query(`delete from documents where metadata ->> 'fixture' = $1`, [name]);
  await client.query(`delete from entities where attributes ->> 'fixture' = $1`, [name]);
  await client.query(`delete from templates where id like $1`, [`template-${name}-%`]);
}

export async function loadFixtures(client, dataset, { reset = true } = {}) {
  const { name } = dataset;
  if (reset) {
    await removeFixtures(client, name);
  } else if (await hasFixtures(client, name)) {
    return { loaded: false };
  }

  for (const user of dataset.users ?? []) {
    await client.query(
      `
        insert into users (id, display_name, email, status, initials)
        values ($1, $2, $3, 'active', $4)
        on conflict (email) do nothing
      `,
      [user.id, user.displayName, user.email, user.initials ?? null]
    );
  }

  for (const entity of dataset.entities) {
    await client.query(
      `
        insert into entities (id, type, subtype, label, status, document_id, attributes)
        values ($1, $2, $3, $4, $5, null, $6::jsonb)
      `,
      [entity.id, entity.type, entity.subtype ?? null, entity.label, entity.status ?? 'verified', JSON.stringify({ ...entity.attributes, fixture: name })]
    );
    for (const alias of entity.aliases ?? []) {
      await client.query(`insert into entity_aliases (id, entity_id, alias, kind) values ($1, $2, $3, 'synonym')`, [createId('alias'), entity.id, alias]);
    }
  }

  // Documents in dataset order: a group before its projects, a project before its experiments.
  const numbers = new Map();
  for (const document of dataset.documents) {
    const metadata = { ...(document.metadata ?? {}), fixture: name };
    if (document.kind === 'experiment') {
      const next = (numbers.get(document.parentId) ?? 0) + 1;
      numbers.set(document.parentId, next);
      metadata.number = next;
    }
    const content = document.content ?? { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: document.title }] }] };
    await client.query(
      `
        insert into documents (id, kind, parent_id, title, content, search_text, metadata)
        values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)
      `,
      [document.id, document.kind, document.parentId ?? null, document.title, JSON.stringify(content), extractText(content), JSON.stringify(metadata)]
    );
    await syncDocumentEntity(client, document.id);
    await recordRevision(client, document.id, { title: document.title, content, coalesce: false });
  }

  for (const relation of dataset.relations ?? []) {
    await client.query(
      `
        insert into entity_relations (id, subject_entity_id, predicate, object_entity_id, confidence, source_document_id)
        values ($1, $2, $3, $4, null, $5)
      `,
      [createId('relation'), relation.subject.id, relation.predicate, relation.object.id, relation.sourceDocumentId ?? null]
    );
  }

  for (const template of dataset.templates ?? []) {
    await client.query(`insert into templates (id, name, kind, content) values ($1, $2, $3, $4::jsonb)`, [template.id, template.name, template.kind ?? 'experiment', JSON.stringify(template.content)]);
  }

  // Derived data last, once every entity and document the content refers to exists.
  for (const document of dataset.documents) {
    const row = await client.query('select content from documents where id = $1', [document.id]);
    await syncDocumentMentions(client, document.id, row.rows[0].content);
  }

  return { loaded: true, documents: dataset.documents.length, entities: dataset.entities.length };
}
