import type { JSONContent } from '@tiptap/core';

export type NotebookDocumentKind = 'group' | 'project' | 'protocol';

type TemplateDefinition = {
  defaultTitle: string;
  nodes: JSONContent[];
};

const TEMPLATE_DEFINITIONS: Record<NotebookDocumentKind, TemplateDefinition> = {
  group: {
    defaultTitle: 'Untitled Group',
    nodes: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Untitled Group' }] }]
  },
  project: {
    defaultTitle: 'Untitled Project',
    nodes: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Untitled Project' }] }]
  },
  protocol: {
    defaultTitle: 'Untitled Protocol',
    nodes: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Untitled Protocol' }] }, { type: 'paragraph' }]
  }
};

function cloneNode(node: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(node)) as JSONContent;
}

function collectText(content: JSONContent | null | undefined): string {
  if (!content) {
    return '';
  }

  if (typeof content.text === 'string') {
    return content.text;
  }

  if (!Array.isArray(content.content)) {
    return '';
  }

  return content.content.map((node) => collectText(node)).join('');
}

function getHeadingLevel(node: JSONContent | null | undefined): number | null {
  if (!node || node.type !== 'heading') {
    return null;
  }

  const level = Number(node.attrs?.level);
  return Number.isFinite(level) ? level : 1;
}

function hasSameTopLevelShape(required: JSONContent, actual: JSONContent | undefined): boolean {
  if (!actual || required.type !== actual.type) {
    return false;
  }

  if (required.type === 'heading') {
    return getHeadingLevel(required) === getHeadingLevel(actual);
  }

  return true;
}

export function extractDocumentTitle(content: JSONContent, fallback: string): string {
  const firstNode = Array.isArray(content.content) ? content.content[0] : null;
  const isH1 = firstNode?.type === 'heading' && getHeadingLevel(firstNode) === 1;
  if (!isH1) {
    return fallback;
  }

  const title = collectText(firstNode).trim();
  return title.length > 0 ? title : fallback;
}

export function createTemplateDocument(kind: NotebookDocumentKind, title?: string): JSONContent {
  const definition = TEMPLATE_DEFINITIONS[kind];
  const fallbackTitle = title?.trim() || definition.defaultTitle;
  const nodes = definition.nodes.map((node, index) => {
    const cloned = cloneNode(node);
    if (index === 0 && cloned.type === 'heading') {
      cloned.attrs = { ...(cloned.attrs ?? {}), level: 1 };
      cloned.content = [{ type: 'text', text: fallbackTitle }];
    }
    return cloned;
  });

  return {
    type: 'doc',
    content: nodes
  };
}

export function normalizeTemplateDocument(
  kind: NotebookDocumentKind,
  content: JSONContent | null | undefined,
  fallbackTitle?: string
): JSONContent {
  const definition = TEMPLATE_DEFINITIONS[kind];
  const defaultTitle = fallbackTitle?.trim() || definition.defaultTitle;
  const inputNodes = Array.isArray(content?.content) ? content.content : [];
  const firstInputNode = inputNodes[0];
  const title = extractDocumentTitle(content ?? { type: 'doc', content: [] }, collectText(firstInputNode).trim() || defaultTitle);

  const requiredNodes = createTemplateDocument(kind, title).content ?? [];
  const strictRequiredCount = kind === 'protocol' ? 1 : requiredNodes.length;
  const strictRequiredNodes = requiredNodes.slice(0, strictRequiredCount);

  const normalizedRequired = strictRequiredNodes.map((requiredNode, index) => {
    const actualNode = inputNodes[index];
    if (!hasSameTopLevelShape(requiredNode, actualNode)) {
      return cloneNode(requiredNode);
    }

    if (index === 0 && actualNode?.type === 'heading') {
      return {
        ...actualNode,
        attrs: { ...(actualNode.attrs ?? {}), level: 1 }
      };
    }

    return cloneNode(actualNode as JSONContent);
  });

  const keepTrailingNodes = kind === 'protocol';
  const trailing = keepTrailingNodes ? inputNodes.slice(strictRequiredCount).map((node) => cloneNode(node)) : [];

  return {
    type: 'doc',
    content: [...normalizedRequired, ...trailing]
  };
}

export function getDefaultTitle(kind: NotebookDocumentKind): string {
  return TEMPLATE_DEFINITIONS[kind].defaultTitle;
}
