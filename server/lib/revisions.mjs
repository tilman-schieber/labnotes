import { createId } from './ids.mjs';

// Autosave fires after every pause in typing. Changes that land within this window of the
// latest revision's start are folded into it, so a revision is a writing session chunk
// rather than a keystroke burst.
const COALESCE_SECONDS = Number(process.env.REVISION_COALESCE_SECONDS ?? 120);

const REVISION_COLUMNS = `
  id,
  document_id as "documentId",
  revision,
  title,
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

// Records the document's current title/content as a revision. With `coalesce`, a change
// inside the window updates the latest revision in place instead of adding a new one.
export async function recordRevision(client, documentId, { title, content, coalesce = true }) {
  const latestResult = await client.query(
    `
      select id, revision, extract(epoch from now() - created_at) as "ageSeconds"
      from document_revisions
      where document_id = $1
      order by revision desc
      limit 1
    `,
    [documentId]
  );
  const latest = latestResult.rows[0] ?? null;

  if (coalesce && latest && Number(latest.ageSeconds) < COALESCE_SECONDS) {
    await client.query(
      `
        update document_revisions
        set title = $2, content = $3::jsonb, updated_at = now()
        where id = $1
      `,
      [latest.id, title, JSON.stringify(content)]
    );
    return latest.revision;
  }

  const revision = (latest?.revision ?? 0) + 1;
  await client.query(
    `
      insert into document_revisions (id, document_id, revision, title, content)
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [createId('revision'), documentId, revision, title, JSON.stringify(content)]
  );
  return revision;
}

export async function listRevisions(client, documentId) {
  const result = await client.query(
    `
      select ${REVISION_COLUMNS}
      from document_revisions
      where document_id = $1
      order by revision desc
    `,
    [documentId]
  );
  return result.rows;
}

export async function getRevision(client, documentId, revision) {
  const result = await client.query(
    `
      select ${REVISION_COLUMNS}, content
      from document_revisions
      where document_id = $1 and revision = $2
    `,
    [documentId, revision]
  );
  return result.rows[0] ?? null;
}
