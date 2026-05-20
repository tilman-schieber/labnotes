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

export type BackendEntitySearchResult = {
  id: string;
  label: string;
  type: string;
  subtype: string | null;
  status: string;
  documentId: string | null;
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

export async function searchEntities(query: string): Promise<BackendEntitySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await request<{ entities: BackendEntitySearchResult[] }>(`/entities/search?${params.toString()}`);
  return payload.entities;
}

export async function searchUsers(query: string): Promise<BackendUserSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const payload = await request<{ users: BackendUserSearchResult[] }>(`/users/search?${params.toString()}`);
  return payload.users;
}
