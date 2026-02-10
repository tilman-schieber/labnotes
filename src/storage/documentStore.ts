import type { JSONContent } from '@tiptap/core';
import {
  createTemplateDocument,
  extractDocumentTitle,
  getDefaultTitle,
  normalizeTemplateDocument
} from '../documents/templates';

export const LAB_DB_STORAGE_KEY = 'lab-notebook-db';

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

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSeedData(): NotebookDB {
  const groupId = createId('group');
  const projectId = createId('project');
  const protocolId = createId('protocol');

  return {
    groups: [{ id: groupId, name: 'Default Group', content: createTemplateDocument('group', 'Default Group') }],
    projects: [
      {
        id: projectId,
        groupId,
        name: 'General',
        content: createTemplateDocument('project', 'General')
      }
    ],
    protocols: [
      {
        id: protocolId,
        groupId,
        projectId,
        title: 'Untitled Protocol',
        content: createBlankDocument()
      }
    ],
    active: {
      groupId,
      projectId,
      protocolId
    }
  };
}

function normalize(db: NotebookDB): NotebookDB {
  if (db.groups.length === 0) {
    return createSeedData();
  }

  const groupId = db.groups.some((group) => group.id === db.active.groupId)
    ? db.active.groupId
    : db.groups[0]?.id ?? null;

  const projectsInGroup = db.projects.filter((project) => project.groupId === groupId);
  const projectId =
    projectsInGroup.some((project) => project.id === db.active.projectId)
      ? db.active.projectId
      : projectsInGroup[0]?.id ?? null;

  const protocolsInProject = db.protocols.filter((protocol) => protocol.projectId === projectId);
  const protocolId =
    protocolsInProject.some((protocol) => protocol.id === db.active.protocolId)
      ? db.active.protocolId
      : protocolsInProject[0]?.id ?? null;

  const protocols = db.protocols.map((protocol) => {
    const content = normalizeProtocolContent(protocol.content, protocol.title || 'Untitled Protocol');
    const title = extractProtocolTitle(content, protocol.title || 'Untitled Protocol');

    return {
      ...protocol,
      content,
      title
    };
  });

  const groups = db.groups.map((group) => {
    const fallbackTitle = group.name || getDefaultTitle('group');
    const content = normalizeTemplateDocument('group', group.content, fallbackTitle);
    const name = extractDocumentTitle(content, fallbackTitle);
    return { ...group, content, name };
  });

  const projects = db.projects.map((project) => {
    const fallbackTitle = project.name || getDefaultTitle('project');
    const content = normalizeTemplateDocument('project', project.content, fallbackTitle);
    const name = extractDocumentTitle(content, fallbackTitle);
    return { ...project, content, name };
  });

  return {
    ...db,
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

export function loadNotebookDb(): NotebookDB {
  const raw = localStorage.getItem(LAB_DB_STORAGE_KEY);

  if (!raw) {
    const seeded = createSeedData();
    saveNotebookDb(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as NotebookDB;
    const normalized = normalize(parsed);
    saveNotebookDb(normalized);
    return normalized;
  } catch {
    const seeded = createSeedData();
    saveNotebookDb(seeded);
    return seeded;
  }
}

export function saveNotebookDb(db: NotebookDB): void {
  localStorage.setItem(LAB_DB_STORAGE_KEY, JSON.stringify(db));
}
