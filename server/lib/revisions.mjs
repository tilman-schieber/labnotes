import { createHash } from 'node:crypto';
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
  r.signature_note as "signatureNote",
  r.content_hash as "contentHash",
  r.previous_chain_hash as "previousChainHash",
  r.chain_hash as "chainHash"
`;

const REVISION_FROM = 'from document_revisions r left join users u on u.id = r.signed_by';

// JSON with object keys sorted recursively, so the same document hashes identically whether
// it comes back from jsonb (which reorders keys) or from a text column.
export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function hashRevisionContent(title, content) {
  return sha256(canonicalJson({ title, content }));
}

// Chain link: previous signed link, this content, and who/when/why signed.
export function hashChainLink({ previousChainHash, contentHash, signedBy, signedAt, note }) {
  return sha256([previousChainHash ?? '', contentHash, signedBy, signedAt, note ?? ''].join('\n'));
}

// Timestamps come back as Date (pg) or ISO string (sqlite); the chain hashes the ISO form.
export function isoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

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

// Signed revisions of a document in signing order; the chain follows this order.
async function listSignedRevisions(client, documentId) {
  const result = await client.query(
    `
      select ${REVISION_COLUMNS}, r.content
      ${REVISION_FROM}
      where r.document_id = $1 and r.signed_at is not null
      order by r.signed_at asc, r.revision asc
    `,
    [documentId]
  );
  return result.rows;
}

export async function signRevision(client, documentId, revision, { userId, note }) {
  const userResult = await client.query("select id from users where id = $1 and status = 'active'", [userId]);
  if (userResult.rowCount === 0) {
    throw new SignError('Signing user not found', 400);
  }

  const target = await getRevision(client, documentId, revision);
  if (!target) {
    throw new SignError('Revision not found', 404);
  }
  if (target.signedAt) {
    throw new SignError('Revision is already signed', 409);
  }

  const signed = await listSignedRevisions(client, documentId);
  const previousChainHash = signed.length > 0 ? signed[signed.length - 1].chainHash : null;
  const contentHash = hashRevisionContent(target.title, target.content);
  const signedAt = new Date().toISOString();
  const chainHash = hashChainLink({ previousChainHash, contentHash, signedBy: userId, signedAt, note: note ?? null });

  const result = await client.query(
    `
      update document_revisions
      set signed_by = $3, signed_at = $4, signature_note = $5,
          content_hash = $6, previous_chain_hash = $7, chain_hash = $8
      where document_id = $1 and revision = $2 and signed_at is null
      returning id
    `,
    [documentId, revision, userId, signedAt, note ?? null, contentHash, previousChainHash, chainHash]
  );

  if (result.rowCount === 0) {
    throw new SignError('Revision is already signed', 409);
  }

  return getRevision(client, documentId, revision);
}

// Recomputes every signed revision's hashes and checks the links between them.
export async function verifyRevisionChain(client, documentId) {
  const signed = await listSignedRevisions(client, documentId);
  let expectedPrevious = null;
  const revisions = signed.map((row) => {
    const problems = [];
    const contentHash = hashRevisionContent(row.title, row.content);
    if (contentHash !== row.contentHash) {
      problems.push('content differs from what was signed');
    }
    if ((row.previousChainHash ?? null) !== expectedPrevious) {
      problems.push('link to the previously signed revision is broken');
    }
    const chainHash = hashChainLink({
      previousChainHash: row.previousChainHash,
      contentHash: row.contentHash,
      signedBy: row.signedBy,
      signedAt: isoTimestamp(row.signedAt),
      note: row.signatureNote
    });
    if (chainHash !== row.chainHash) {
      problems.push('signature record was altered');
    }
    expectedPrevious = row.chainHash;
    return { revision: row.revision, signedAt: row.signedAt, signedByName: row.signedByName, chainHash: row.chainHash, ok: problems.length === 0, problems };
  });

  return { ok: revisions.every((item) => item.ok), head: expectedPrevious, revisions };
}
