import type { JSONContent } from '@tiptap/core';
import type { NotebookDocumentKind } from '../documents/templates';

const API_ROOT = '/api';

export type BackendDocumentNode = {
  id: string;
  kind: NotebookDocumentKind;
  parentId: string | null;
  title: string;
  content: JSONContent;
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
};

export type BackendEntitySearchResult = {
  id: string;
  label: string;
  type: string;
  subtype: string | null;
  status: string;
  documentId: string | null;
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

export async function deleteDocument(id: string): Promise<void> {
  await request(`/documents/${id}`, { method: 'DELETE' });
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

export type BackendEntityDetail = {
  entity: BackendEntityRecord;
  aliases: BackendEntityAlias[];
  backlinks: BackendBacklink[];
};

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

export async function deleteEntityAlias(id: string, aliasId: string): Promise<void> {
  await request(`/entities/${id}/aliases/${aliasId}`, { method: 'DELETE' });
}

export async function createEntity(type: string, label: string): Promise<BackendEntityRecord> {
  const payload = await request<{ entity: BackendEntityRecord }>('/entities', {
    method: 'POST',
    body: JSON.stringify({ type, label })
  });

  return payload.entity;
}

export async function searchUsers(query: string): Promise<BackendUserSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await request<{ users: BackendUserSearchResult[] }>(`/users/search?${params.toString()}`);
  return payload.users;
}
