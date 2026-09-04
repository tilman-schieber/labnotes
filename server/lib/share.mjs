import { randomBytes } from 'node:crypto';
import { getRevision } from './revisions.mjs';

export class ShareError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// One token per signed revision; asking again returns the existing link.
export async function createShareLink(client, documentId, revision) {
  const target = await getRevision(client, documentId, revision);
  if (!target) {
    throw new ShareError('Revision not found', 404);
  }
  if (!target.signedAt) {
    throw new ShareError('Only signed revisions can be shared', 400);
  }

  const existing = await client.query('select token, created_at as "createdAt" from share_links where document_id = $1 and revision = $2', [
    documentId,
    revision
  ]);
  if (existing.rowCount > 0) {
    return { token: existing.rows[0].token, createdAt: existing.rows[0].createdAt, revision };
  }

  const token = randomBytes(18).toString('base64url');
  const inserted = await client.query(
    'insert into share_links (token, document_id, revision) values ($1, $2, $3) returning token, created_at as "createdAt"',
    [token, documentId, revision]
  );
  return { token: inserted.rows[0].token, createdAt: inserted.rows[0].createdAt, revision };
}

export async function listShareLinks(client, documentId) {
  const result = await client.query('select token, revision, created_at as "createdAt" from share_links where document_id = $1 order by revision desc', [
    documentId
  ]);
  return result.rows;
}

export async function revokeShareLink(client, token) {
  const result = await client.query('delete from share_links where token = $1', [token]);
  return result.rowCount > 0;
}

export async function resolveShareLink(client, token) {
  const result = await client.query('select document_id as "documentId", revision from share_links where token = $1', [token]);
  return result.rows[0] ?? null;
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Standalone read-only page: signature facts plus the frozen PDF. No app code, no editing.
export function renderSharePage({ token, title, path, revision }) {
  const signedAt = revision.signedAt ? new Date(revision.signedAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — revision ${revision.revision}</title>
<style>
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1f2937; background: #f3f4f6; display: flex; flex-direction: column; min-height: 100vh; }
  header { padding: 14px 20px; background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: baseline; }
  h1 { font-size: 16px; margin: 0; }
  .path { color: #6b7280; }
  .sig { color: #0f766e; }
  .hash { font-family: ui-monospace, monospace; font-size: 12px; color: #6b7280; word-break: break-all; }
  .badge { background: #ccfbf1; color: #0f766e; border-radius: 4px; padding: 1px 6px; font-size: 12px; }
  iframe { flex: 1; border: 0; width: 100%; min-height: 80vh; }
  footer { padding: 8px 20px; color: #6b7280; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  ${path.length > 0 ? `<span class="path">${escapeHtml(path.join(' › '))}</span>` : ''}
  <span class="badge">revision ${revision.revision} · read-only</span>
  <span class="sig">signed by ${escapeHtml(revision.signedByName ?? revision.signedBy ?? '')} on ${escapeHtml(signedAt)} UTC${
    revision.signatureNote ? ` — “${escapeHtml(revision.signatureNote)}”` : ''
  }</span>
  <span class="hash" title="Chain hash of this signature">chain ${escapeHtml(revision.chainHash ?? '')}</span>
</header>
<iframe src="/share/${encodeURIComponent(token)}.pdf" title="Document PDF"></iframe>
<footer>Frozen snapshot from a lab notebook. <a href="/share/${encodeURIComponent(token)}.typ">Typst source</a></footer>
</body>
</html>
`;
}
