import { sql } from './database.mjs';
import { createId } from './ids.mjs';

// Autosave fires after every pause in typing. Changes that land within this window of the
// latest revision's start are folded into it, so a revision is a writing session chunk
// rather than a keystroke burst.
const COALESCE_SECONDS = Number(process.env.REVISION_COALESCE_SECONDS ?? 120);

const REVISION_COLUMNS = `
  r.id,
  r.document_id as "documentId",
  r.revision,
  r.title,
  r.created_at as "createdAt",
  r.updated_at as "updatedAt",
  r.signed_by as "signedBy",
  u.display_name as "signedByName",
  r.signed_at as "signedAt",
  r.signature_note as "signatureNote"
`;

const REVISION_FROM = 'from document_revisions r left join users u on u.id = r.signed_by';

// Records the document's current title/content as a revision. With `coalesce`, a change
// inside the window updates the latest revision in place instead of adding a new one.
// Signed revisions are never updated in place.
export async function recordRevision(client, documentId, { title, content, coalesce = true }) {
  const latestResult = await client.query(
    `
      select id, revision, signed_at is not null as signed, ${sql.ageSeconds('created_at')} as "ageSeconds"
      from document_revisions
      where document_id = $1
      order by revision desc
      limit 1
    `,
    [documentId]
  );
  const latest = latestResult.rows[0] ?? null;

  if (coalesce && latest && !latest.signed && Number(latest.ageSeconds) < COALESCE_SECONDS) {
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
      ${REVISION_FROM}
      where r.document_id = $1
      order by r.revision desc
    `,
    [documentId]
  );
  return result.rows;
}

export async function getRevision(client, documentId, revision) {
  const result = await client.query(
    `
      select ${REVISION_COLUMNS}, r.content
      ${REVISION_FROM}
      where r.document_id = $1 and r.revision = $2
    `,
    [documentId, revision]
  );
  return result.rows[0] ?? null;
}

export class SignError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function signRevision(client, documentId, revision, { userId, note }) {
  const userResult = await client.query("select id from users where id = $1 and status = 'active'", [userId]);
  if (userResult.rowCount === 0) {
    throw new SignError('Signing user not found', 400);
  }

  const result = await client.query(
    `
      update document_revisions
      set signed_by = $3, signed_at = now(), signature_note = $4
      where document_id = $1 and revision = $2 and signed_at is null
      returning id
    `,
    [documentId, revision, userId, note ?? null]
  );

  if (result.rowCount === 0) {
    const exists = await getRevision(client, documentId, revision);
    throw exists ? new SignError('Revision is already signed', 409) : new SignError('Revision not found', 404);
  }

  return getRevision(client, documentId, revision);
}
