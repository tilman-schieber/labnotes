import { createId } from './ids.mjs';

// TipTap node type -> document_mentions.ref_type
const MENTION_NODE_TYPES = {
  entityMention: 'entity',
  userMention: 'user'
};

function mentionKey(mention) {
  return `${mention.refType}:${mention.targetId}`;
}

// Walks a TipTap JSON document and returns one entry per distinct referenced target.
export function extractMentions(content) {
  const mentions = new Map();

  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const refType = MENTION_NODE_TYPES[node.type];
    const targetId = node.attrs?.id;

    if (refType && targetId !== null && targetId !== undefined && targetId !== '') {
      const mention = {
        refType,
        targetId: String(targetId),
        label: typeof node.attrs.label === 'string' ? node.attrs.label : null
      };

      if (!mentions.has(mentionKey(mention))) {
        mentions.set(mentionKey(mention), mention);
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(visit);
    }
  };

  visit(content);
  return [...mentions.values()];
}

// Returns a copy of `content` with entity mention nodes retargeted from `fromId` to `toId`
// (label updated to `label`), plus whether anything changed. Used when merging entities.
export function retargetEntityMentions(content, fromId, toId, label) {
  let changed = false;

  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return node;
    }

    let next = node;
    if (node.type === 'entityMention' && String(node.attrs?.id) === fromId) {
      changed = true;
      next = { ...node, attrs: { ...node.attrs, id: toId, label } };
    }

    if (Array.isArray(next.content)) {
      const children = next.content.map(visit);
      if (children.some((child, index) => child !== next.content[index])) {
        next = { ...next, content: children };
      }
    }

    return next;
  };

  return { content: visit(content), changed };
}

// Reconciles editor-sourced document_mentions rows with the references present in `content`.
// Rows are diffed rather than replaced so created_at keeps meaning "first referenced at".
export async function syncDocumentMentions(client, documentId, content) {
  const mentions = extractMentions(content);
  const nextByKey = new Map(mentions.map((mention) => [mentionKey(mention), mention]));

  const existingResult = await client.query(
    `
      select id, ref_type as "refType", target_id as "targetId", label_snapshot as "labelSnapshot"
      from document_mentions
      where document_id = $1 and source = 'editor'
    `,
    [documentId]
  );

  const existingByKey = new Map(existingResult.rows.map((row) => [mentionKey(row), row]));
  const staleIds = existingResult.rows.filter((row) => !nextByKey.has(mentionKey(row))).map((row) => row.id);

  if (staleIds.length > 0) {
    await client.query('delete from document_mentions where id = any($1::text[])', [staleIds]);
  }

  for (const mention of mentions) {
    const existing = existingByKey.get(mentionKey(mention));

    if (!existing) {
      await client.query(
        `
          insert into document_mentions (id, document_id, ref_type, target_id, label_snapshot, source)
          values ($1, $2, $3, $4, $5, 'editor')
        `,
        [createId('mention'), documentId, mention.refType, mention.targetId, mention.label]
      );
      continue;
    }

    if (existing.labelSnapshot !== mention.label) {
      await client.query('update document_mentions set label_snapshot = $2 where id = $1', [existing.id, mention.label]);
    }
  }

  return mentions;
}

export async function syncAllDocumentMentions(client) {
  const documentsResult = await client.query('select id, content from documents');

  for (const document of documentsResult.rows) {
    await syncDocumentMentions(client, document.id, document.content);
  }
}
