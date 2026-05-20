import type { JSONContent } from '@tiptap/core';
import type { NotebookDocumentKind } from '../documents/templates';
import {
  createTemplateDocument,
  extractDocumentTitle,
  getDefaultTitle,
  normalizeTemplateDocument
} from '../documents/templates';
import {
  createDocument,
  deleteDocument,
  fetchDocumentTree,
  updateDocument,
  type BackendDocumentNode,
  type BackendDocumentRecord
} from '../api/backend';

export const LAB_ACTIVE_STORAGE_KEY = 'lab-notebook-active';

export type NotebookGroup = {
  id: string;
  name: string;
  content: JSONContent;
};

export type NotebookProject = {
  id: string;
  groupId: string;
  name: string;
  content: JSONContent;
};

export type NotebookProtocol = {
  id: string;
  groupId: string;
  projectId: string;
  title: string;
  content: JSONContent;
};

export type NotebookDB = {
  groups: NotebookGroup[];
  projects: NotebookProject[];
  protocols: NotebookProtocol[];
  active: {
    groupId: string | null;
    projectId: string | null;
    protocolId: string | null;
  };
};

export type NotebookActiveState = NotebookDB['active'];

export function extractProtocolTitle(content: JSONContent, fallback = 'Untitled Protocol'): string {
  return extractDocumentTitle(content, fallback);
}

export function normalizeProtocolContent(
  content: JSONContent | null | undefined,
  fallbackTitle = 'Untitled Protocol'
): JSONContent {
  return normalizeTemplateDocument('protocol', content, fallbackTitle);
}

export function createBlankDocument(title = 'Untitled Protocol'): JSONContent {
  return createTemplateDocument('protocol', title);
}

function normalizeStoredActive(active: NotebookActiveState | null | undefined): NotebookActiveState {
  return {
    groupId: active?.groupId ?? null,
    projectId: active?.projectId ?? null,
    protocolId: active?.protocolId ?? null
  };
}

function readStoredActive(): NotebookActiveState {
  if (typeof window === 'undefined') {
    return normalizeStoredActive(null);
  }

  const raw = localStorage.getItem(LAB_ACTIVE_STORAGE_KEY);
  if (!raw) {
    return normalizeStoredActive(null);
  }

  try {
    return normalizeStoredActive(JSON.parse(raw) as NotebookActiveState);
  } catch {
    return normalizeStoredActive(null);
  }
}

export function saveActiveSelection(active: NotebookActiveState): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(LAB_ACTIVE_STORAGE_KEY, JSON.stringify(normalizeStoredActive(active)));
}

function normalizeGroup(node: BackendDocumentNode): NotebookGroup {
  const fallbackTitle = node.title || getDefaultTitle('group');
  const content = normalizeTemplateDocument('group', node.content, fallbackTitle);
  return {
    id: node.id,
    name: extractDocumentTitle(content, fallbackTitle),
    content
  };
}

function normalizeProject(node: BackendDocumentNode, groupId: string): NotebookProject {
  const fallbackTitle = node.title || getDefaultTitle('project');
  const content = normalizeTemplateDocument('project', node.content, fallbackTitle);
  return {
    id: node.id,
    groupId,
    name: extractDocumentTitle(content, fallbackTitle),
    content
  };
}

function normalizeProtocol(node: BackendDocumentNode, groupId: string, projectId: string): NotebookProtocol {
  const fallbackTitle = node.title || getDefaultTitle('protocol');
  const content = normalizeTemplateDocument('protocol', node.content, fallbackTitle);
  return {
    id: node.id,
    groupId,
    projectId,
    title: extractDocumentTitle(content, fallbackTitle),
    content
  };
}

function mapTreeToNotebookDb(tree: BackendDocumentNode[], preferredActive?: NotebookActiveState | null): NotebookDB {
  const groups: NotebookGroup[] = [];
  const projects: NotebookProject[] = [];
  const protocols: NotebookProtocol[] = [];

  tree.forEach((groupNode) => {
    groups.push(normalizeGroup(groupNode));

    groupNode.children.forEach((projectNode) => {
      projects.push(normalizeProject(projectNode, groupNode.id));

      projectNode.children.forEach((protocolNode) => {
        protocols.push(normalizeProtocol(protocolNode, groupNode.id, projectNode.id));
      });
    });
  });

  const requestedActive = normalizeStoredActive(preferredActive ?? readStoredActive());
  const groupId = groups.some((group) => group.id === requestedActive.groupId)
    ? requestedActive.groupId
    : groups[0]?.id ?? null;

  const projectsInGroup = projects.filter((project) => project.groupId === groupId);
  const projectId = projectsInGroup.some((project) => project.id === requestedActive.projectId)
    ? requestedActive.projectId
    : projectsInGroup[0]?.id ?? null;

  const protocolsInProject = protocols.filter((protocol) => protocol.projectId === projectId);
  const protocolId = protocolsInProject.some((protocol) => protocol.id === requestedActive.protocolId)
    ? requestedActive.protocolId
    : protocolsInProject[0]?.id ?? null;

  return {
    groups,
    projects,
    protocols,
    active: {
      groupId,
      projectId,
      protocolId
    }
  };
}

export async function loadNotebookDb(preferredActive?: NotebookActiveState | null): Promise<NotebookDB> {
  const tree = await fetchDocumentTree();
  return mapTreeToNotebookDb(tree, preferredActive);
}

export async function createNotebookDocument(
  kind: NotebookDocumentKind,
  parentId: string | null,
  title: string,
  content: JSONContent
): Promise<BackendDocumentRecord> {
  return createDocument(kind, parentId, title, content);
}

export async function updateNotebookDocument(
  id: string,
  title: string,
  content: JSONContent
): Promise<BackendDocumentRecord> {
  return updateDocument(id, title, content);
}

export async function deleteNotebookDocument(id: string): Promise<void> {
  await deleteDocument(id);
}
