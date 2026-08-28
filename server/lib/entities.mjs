import { createId } from './ids.mjs';
import { retargetEntityMentions, syncDocumentMentions } from './mentions.mjs';
import { recordRevision } from './revisions.mjs';
import { extractText } from './text.mjs';

export class MergeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Folds `sourceId` into `targetId`: aliases move over (the source label becomes one), every
// document that references the source is rewritten to the target (recorded as a revision),
// relations are re-pointed, and the source is deleted.
export async function mergeEntities(client, targetId, sourceId) {
  if (targetId === sourceId) {
    throw new MergeError('Cannot merge an entity into itself');
  }

  const rows = await client.query('select id, label, document_id as "documentId" from entities where id = any($1::text[]) for update', [
    [targetId, sourceId]
  ]);
  const target = rows.rows.find((row) => row.id === targetId);
  const source = rows.rows.find((row) => row.id === sourceId);

  if (!target || !source) {
    throw new MergeError('Entity not found', 404);
  }

  if (target.documentId || source.documentId) {
    throw new MergeError('Document entities cannot be merged');
  }

  // Aliases: move, keeping the target's own on conflict. The source label survives as an alias.
  await client.query(
    `
      insert into entity_aliases (id, entity_id, alias, kind)
      select $1 || '-' || a.id, $2, a.alias, a.kind
      from entity_aliases a
      where a.entity_id = $3
      on conflict (entity_id, alias) do nothing
    `,
    [createId('alias'), targetId, sourceId]
  );
  await client.query(
    `
      insert into entity_aliases (id, entity_id, alias, kind)
      values ($1, $2, $3, 'merged')
      on conflict (entity_id, alias) do nothing
    `,
    [createId('alias'), targetId, source.label]
  );

  // Relations: re-point, dropping any that would duplicate an existing target relation or self-loop.
  await client.query(
    `
      delete from entity_relations r
      where (r.subject_entity_id = $1 and r.object_entity_id = $2)
         or (r.subject_entity_id = $2 and r.object_entity_id = $1)
    `,
    [sourceId, targetId]
  );
  await client.query(
    `
      update entity_relations r
      set subject_entity_id = $2
      where r.subject_entity_id = $1
        and not exists (
          select 1 from entity_relations t
          where t.subject_entity_id = $2 and t.predicate = r.predicate and t.object_entity_id = r.object_entity_id
            and t.source_document_id is not distinct from r.source_document_id
        )
    `,
    [sourceId, targetId]
  );
  await client.query(
    `
      update entity_relations r
      set object_entity_id = $2
      where r.object_entity_id = $1
        and not exists (
          select 1 from entity_relations t
          where t.object_entity_id = $2 and t.predicate = r.predicate and t.subject_entity_id = r.subject_entity_id
            and t.source_document_id is not distinct from r.source_document_id
        )
    `,
    [sourceId, targetId]
  );

  // Documents: rewrite inline references, then re-index mentions from the new content.
  const documents = await client.query(
    `
      select d.id, d.title, d.content
      from documents d
      where exists (select 1 from document_mentions m where m.document_id = d.id and m.ref_type = 'entity' and m.target_id = $1)
    `,
    [sourceId]
  );

  const rewrittenDocumentIds = [];
  for (const document of documents.rows) {
    const { content, changed } = retargetEntityMentions(document.content, sourceId, targetId, target.label);
    if (!changed) {
      continue;
    }

    await client.query('update documents set content = $2::jsonb, search_text = $3, updated_at = now() where id = $1', [
      document.id,
      JSON.stringify(content),
      extractText(content)
    ]);
    await syncDocumentMentions(client, document.id, content);
    await recordRevision(client, document.id, { title: document.title, content, coalesce: false });
    rewrittenDocumentIds.push(document.id);
  }

  // Any remaining rows (e.g. import-sourced) are re-pointed directly.
  await client.query(
    `
      delete from document_mentions s
      where s.ref_type = 'entity' and s.target_id = $1
        and exists (select 1 from document_mentions t where t.document_id = s.document_id and t.ref_type = 'entity' and t.target_id = $2)
    `,
    [sourceId, targetId]
  );
  await client.query(`update document_mentions set target_id = $2 where ref_type = 'entity' and target_id = $1`, [sourceId, targetId]);

  // Cascade removes the source's aliases and relations (already moved or deduplicated).
  await client.query('delete from entities where id = $1', [sourceId]);
  await client.query('update entities set updated_at = now() where id = $1', [targetId]);

  return { targetId, sourceId, rewrittenDocumentIds };
}
