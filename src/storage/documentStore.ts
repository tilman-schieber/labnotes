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
  type BackendDocumentRecord,
  type DocumentMetadata
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

export type NotebookExperiment = {
  id: string;
  groupId: string;
  projectId: string;
  title: string;
  content: JSONContent;
  metadata: DocumentMetadata;
  createdAt: string;
};

export type NotebookDB = {
  groups: NotebookGroup[];
  projects: NotebookProject[];
  experiments: NotebookExperiment[];
  active: {
    groupId: string | null;
    projectId: string | null;
    experimentId: string | null;
  };
};

export type NotebookActiveState = NotebookDB['active'];

export function extractExperimentTitle(content: JSONContent, fallback = 'Untitled Experiment'): string {
  return extractDocumentTitle(content, fallback);
}

export function normalizeExperimentContent(
  content: JSONContent | null | undefined,
  fallbackTitle = 'Untitled Experiment'
): JSONContent {
  return normalizeTemplateDocument('experiment', content, fallbackTitle);
}

export function createBlankDocument(title = 'Untitled Experiment'): JSONContent {
  return createTemplateDocument('experiment', title);
}

function normalizeStoredActive(active: NotebookActiveState | null | undefined): NotebookActiveState {
  return {
    groupId: active?.groupId ?? null,
    projectId: active?.projectId ?? null,
    experimentId: active?.experimentId ?? null
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

function normalizeExperiment(node: BackendDocumentNode, groupId: string, projectId: string): NotebookExperiment {
  const fallbackTitle = node.title || getDefaultTitle('experiment');
  const content = normalizeTemplateDocument('experiment', node.content, fallbackTitle);
  return {
    id: node.id,
    groupId,
    projectId,
    title: extractDocumentTitle(content, fallbackTitle),
    content,
    metadata: node.metadata ?? {},
    createdAt: node.createdAt
  };
}

function mapTreeToNotebookDb(tree: BackendDocumentNode[], preferredActive?: NotebookActiveState | null): NotebookDB {
  const groups: NotebookGroup[] = [];
  const projects: NotebookProject[] = [];
  const experiments: NotebookExperiment[] = [];

  tree.forEach((groupNode) => {
    groups.push(normalizeGroup(groupNode));

    groupNode.children.forEach((projectNode) => {
      projects.push(normalizeProject(projectNode, groupNode.id));

      projectNode.children.forEach((experimentNode) => {
        experiments.push(normalizeExperiment(experimentNode, groupNode.id, projectNode.id));
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

  const experimentsInProject = experiments.filter((experiment) => experiment.projectId === projectId);
  const experimentId = experimentsInProject.some((experiment) => experiment.id === requestedActive.experimentId)
    ? requestedActive.experimentId
    : experimentsInProject[0]?.id ?? null;

  return {
    groups,
    projects,
    experiments,
    active: {
      groupId,
      projectId,
      experimentId
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
