import type { JSONContent } from '@tiptap/core';
import type { NotebookDocumentKind } from '../documents/templates';

const API_ROOT = '/api';

export type DocumentStatus = 'planned' | 'in_progress' | 'done' | 'failed' | 'abandoned';

export const DOCUMENT_STATUSES: DocumentStatus[] = ['planned', 'in_progress', 'done', 'failed', 'abandoned'];

export type DocumentMetadata = {
  status?: DocumentStatus;
  // ISO date (YYYY-MM-DD)
  date?: string;
  tags?: string[];
};

export type BackendDocumentNode = {
  id: string;
  kind: NotebookDocumentKind;
  parentId: string | null;
  title: string;
  content: JSONContent;
  metadata: DocumentMetadata;
  createdAt: string;
  updatedAt: string;
  children: BackendDocumentNode[];
};

export type BackendDocumentRecord = Omit<BackendDocumentNode, 'children'> & {
  groupId: string | null;
  projectId: string | null;
};

export type BackendRevisionSummary = {
  id: string;
  documentId: string;
  revision: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  signedBy: string | null;
  signedByName: string | null;
  signedAt: string | null;
  signatureNote: string | null;
};

export async function signDocumentRevision(id: string, revision: number, userId: string, note?: string): Promise<BackendRevisionSummary> {
  const payload = await request<{ revision: BackendRevisionSummary }>(`/documents/${id}/revisions/${revision}/sign`, {
    method: 'POST',
    body: JSON.stringify({ userId, note })
  });
  return payload.revision;
}

export type BackendEntitySearchResult = {
  id: string;
  label: string;
  type: string;
  subtype: string | null;
  status: string;
  documentId: string | null;
  smiles: string | null;
  usedInContext: boolean;
  description: string;
};

export type BackendUserSearchResult = {
  id: string;
  label: string;
  email: string | null;
  status: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchDocumentTree(): Promise<BackendDocumentNode[]> {
  const payload = await request<{ documents: BackendDocumentNode[] }>('/documents/tree');
  return payload.documents;
}

export async function createDocument(
  kind: NotebookDocumentKind,
  parentId: string | null,
  title: string,
  content: JSONContent
): Promise<BackendDocumentRecord> {
  const payload = await request<{ document: BackendDocumentRecord }>('/documents', {
    method: 'POST',
    body: JSON.stringify({ kind, parentId, title, content })
  });

  return payload.document;
}

export async function updateDocument(
  id: string,
  title: string,
  content: JSONContent
): Promise<BackendDocumentRecord> {
  const payload = await request<{ document: BackendDocumentRecord }>(`/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title, content })
  });

  return payload.document;
}

export async function updateDocumentMetadata(id: string, metadata: DocumentMetadata): Promise<BackendDocumentRecord> {
  const payload = await request<{ document: BackendDocumentRecord }>(`/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ metadata })
  });

  return payload.document;
}

export async function deleteDocument(id: string): Promise<void> {
  await request(`/documents/${id}`, { method: 'DELETE' });
}

export type BackendTemplate = {
  id: string;
  name: string;
  kind: NotebookDocumentKind;
  createdAt: string;
  updatedAt: string;
};

export async function fetchTemplates(kind?: NotebookDocumentKind): Promise<BackendTemplate[]> {
  const params = new URLSearchParams(kind ? { kind } : {});
  const payload = await request<{ templates: BackendTemplate[] }>(`/templates?${params.toString()}`);
  return payload.templates;
}

export async function fetchTemplate(id: string): Promise<BackendTemplate & { content: JSONContent }> {
  const payload = await request<{ template: BackendTemplate & { content: JSONContent } }>(`/templates/${id}`);
  return payload.template;
}

export async function createTemplateFromDocument(name: string, documentId: string): Promise<BackendTemplate> {
  const payload = await request<{ template: BackendTemplate }>('/templates', {
    method: 'POST',
    body: JSON.stringify({ name, documentId })
  });
  return payload.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: 'DELETE' });
}

export type NotebookSearchResult = {
  id: string;
  kind: NotebookDocumentKind;
  title: string;
  path: string[];
  status: DocumentStatus | null;
  tags: string[];
  // Matches are wrapped in [[ ]]
  snippet: string;
  updatedAt: string;
};

export async function searchNotebook(queryText: string, tag?: string): Promise<NotebookSearchResult[]> {
  const params = new URLSearchParams({ q: queryText });
  if (tag) {
    params.set('tag', tag);
  }
  const payload = await request<{ results: NotebookSearchResult[] }>(`/search?${params.toString()}`);
  return payload.results;
}

export type BackendDocumentSearchResult = {
  id: string;
  entityId: string;
  title: string;
  kind: NotebookDocumentKind;
  path: string[];
};

export async function searchDocuments(query: string): Promise<BackendDocumentSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await request<{ documents: BackendDocumentSearchResult[] }>(`/documents/search?${params.toString()}`);
  return payload.documents;
}

export type BackendDocumentMention = {
  id: string;
  refType: 'entity' | 'user';
  targetId: string;
  labelSnapshot: string | null;
  source: string;
  createdAt: string;
  currentLabel: string | null;
  entityType: string | null;
  entityDocumentId: string | null;
  // Amounts read from the prose around the references (see chemistry/usages.ts)
  quantities: { value: number; unit: string }[];
  role: 'reactant' | 'product' | 'solvent' | null;
};

export type BackendUsage = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentKind: NotebookDocumentKind;
  documentDate: string | null;
  quantities: { value: number; unit: string }[];
  role: 'reactant' | 'product' | 'solvent' | null;
  sentence: string | null;
};

export type BackendUsageTotal = {
  dimension: string;
  quantity: { value: number; unit: string };
};

export async function fetchDocumentMentions(documentId: string): Promise<BackendDocumentMention[]> {
  const payload = await request<{ mentions: BackendDocumentMention[] }>(`/documents/${documentId}/mentions`);
  return payload.mentions;
}

export type BackendAttachment = {
  id: string;
  documentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export function attachmentUrl(id: string, download = false): string {
  return `${API_ROOT}/attachments/${id}${download ? '?download' : ''}`;
}

export async function fetchAttachments(documentId: string): Promise<BackendAttachment[]> {
  const payload = await request<{ attachments: BackendAttachment[] }>(`/documents/${documentId}/attachments`);
  return payload.attachments;
}

export async function uploadAttachment(documentId: string, file: File): Promise<BackendAttachment> {
  const response = await fetch(`${API_ROOT}/documents/${documentId}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name)
    },
    body: file
  });

  if (!response.ok) {
    throw new Error((await response.text()) || `Upload failed with status ${response.status}`);
  }

  return ((await response.json()) as { attachment: BackendAttachment }).attachment;
}

export async function deleteAttachment(id: string): Promise<void> {
  await request(`/attachments/${id}`, { method: 'DELETE' });
}

export async function fetchDocumentRevisions(id: string): Promise<BackendRevisionSummary[]> {
  const payload = await request<{ revisions: BackendRevisionSummary[] }>(`/documents/${id}/revisions`);
  return payload.revisions;
}

export async function restoreDocumentRevision(id: string, revision: number): Promise<BackendDocumentRecord> {
  const payload = await request<{ document: BackendDocumentRecord }>(`/documents/${id}/revisions/${revision}/restore`, {
    method: 'POST'
  });

  return payload.document;
}

export type BackendEntityLabel = {
  id: string;
  type: string;
  label: string;
  aliases: string[];
};

export async function fetchEntityLabels(): Promise<BackendEntityLabel[]> {
  const payload = await request<{ entities: BackendEntityLabel[] }>('/entities/labels');
  return payload.entities;
}

export type EntitySearchOptions = {
  // Document being edited; entities recently referenced in its project rank first.
  documentId?: string | null;
  type?: string;
};

export async function searchEntities(query: string, options: EntitySearchOptions = {}): Promise<BackendEntitySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (options.documentId) {
    params.set('documentId', options.documentId);
  }
  if (options.type) {
    params.set('type', options.type);
  }
  const payload = await request<{ entities: BackendEntitySearchResult[] }>(`/entities/search?${params.toString()}`);
  return payload.entities;
}

export type BackendEntityRecord = {
  id: string;
  type: string;
  subtype: string | null;
  label: string;
  status: string;
  documentId: string | null;
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type BackendEntityListItem = BackendEntityRecord & { mentionCount: number };

export type BackendEntityAlias = {
  id: string;
  entityId: string;
  alias: string;
  kind: string;
  createdAt: string;
};

export type BackendBacklink = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentKind: NotebookDocumentKind;
  refType: 'entity' | 'user';
  targetId: string;
  labelSnapshot: string | null;
  source: string;
  createdAt: string;
};

export type BackendRelation = {
  id: string;
  predicate: string;
  subjectEntityId: string;
  subjectLabel: string;
  subjectType: string;
  objectEntityId: string;
  objectLabel: string;
  objectType: string;
  confidence: number | null;
  sourceDocumentId: string | null;
  sourceDocumentTitle: string | null;
  createdAt: string;
};

export type BackendEntityDetail = {
  entity: BackendEntityRecord;
  aliases: BackendEntityAlias[];
  backlinks: BackendBacklink[];
  relations: BackendRelation[];
  usages: BackendUsage[];
  usageTotals: BackendUsageTotal[];
};

export const RELATION_PREDICATES = ['uses', 'derived_from', 'stored_in', 'references', 'belongs_to'] as const;

export async function addEntityRelation(id: string, predicate: string, objectEntityId: string): Promise<BackendRelation> {
  const payload = await request<{ relation: BackendRelation }>(`/entities/${id}/relations`, {
    method: 'POST',
    body: JSON.stringify({ predicate, objectEntityId })
  });

  return payload.relation;
}

export async function deleteEntityRelation(id: string, relationId: string): Promise<void> {
  await request(`/entities/${id}/relations/${relationId}`, { method: 'DELETE' });
}

export type EntityListFilters = {
  q?: string;
  type?: string;
  status?: string;
};

export type EntityUpdate = Pick<BackendEntityRecord, 'type' | 'subtype' | 'label' | 'status' | 'attributes'>;

export async function fetchEntities(filters: EntityListFilters = {}): Promise<{ entities: BackendEntityListItem[]; types: string[] }> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  return request(`/entities?${params.toString()}`);
}

export async function fetchEntity(id: string): Promise<BackendEntityDetail> {
  return request(`/entities/${id}`);
}

export async function updateEntity(id: string, update: EntityUpdate): Promise<BackendEntityRecord> {
  const payload = await request<{ entity: BackendEntityRecord }>(`/entities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(update)
  });

  return payload.entity;
}

export async function addEntityAlias(id: string, alias: string, kind = 'synonym'): Promise<BackendEntityAlias> {
  const payload = await request<{ alias: BackendEntityAlias }>(`/entities/${id}/aliases`, {
    method: 'POST',
    body: JSON.stringify({ alias, kind })
  });

  return payload.alias;
}

export async function mergeEntities(targetId: string, sourceId: string): Promise<{ rewrittenDocumentIds: string[] }> {
  return request(`/entities/${targetId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ sourceId })
  });
}

export async function deleteEntityAlias(id: string, aliasId: string): Promise<void> {
  await request(`/entities/${id}/aliases/${aliasId}`, { method: 'DELETE' });
}

export async function createEntity(type: string, label: string, status: 'draft' | 'verified' = 'verified'): Promise<BackendEntityRecord> {
  const payload = await request<{ entity: BackendEntityRecord }>('/entities', {
    method: 'POST',
    body: JSON.stringify({ type, label, status })
  });

  return payload.entity;
}

export async function searchUsers(query: string): Promise<BackendUserSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await request<{ users: BackendUserSearchResult[] }>(`/users/search?${params.toString()}`);
  return payload.users;
}
