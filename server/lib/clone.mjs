// Starting the next run from the last one: a copy of the content with everything that belonged
// to *that* run taken out — timestamps, ticked boxes, isolated masses, registered batches and
// the analytics that described them. Amounts, structure and the prose stay.

function cloneNode(node) {
  if (Array.isArray(node)) {
    return node.map(cloneNode).filter((child) => child !== null);
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  switch (node.type) {
    case 'timestamp':
      return null;
    case 'analytics':
      return null;
    case 'taskItem':
      return { ...node, attrs: { ...(node.attrs ?? {}), checked: false }, content: cloneNode(node.content ?? []) };
    case 'reaction': {
      const components = (node.attrs?.components ?? []).map((component) => ({
        ...component,
        actualMass: null,
        batchId: null
      }));
      return { ...node, attrs: { ...(node.attrs ?? {}), components } };
    }
    default: {
      const next = { ...node };
      if (Array.isArray(node.content)) {
        next.content = cloneNode(node.content);
      }
      return next;
    }
  }
}

// A paragraph or heading whose only child was removed must not be left with an empty array.
function dropEmptyContent(node) {
  if (Array.isArray(node.content)) {
    node.content = node.content.map(dropEmptyContent);
    if (node.content.length === 0 && (node.type === 'paragraph' || node.type === 'heading')) {
      delete node.content;
    }
  }
  return node;
}

export function cloneContent(content) {
  return dropEmptyContent(cloneNode(content));
}

// Retitles the document: the first level-1 heading carries the title.
export function withTitle(content, title) {
  const first = content?.content?.[0];
  if (!first || first.type !== 'heading' || Number(first.attrs?.level ?? 1) !== 1) {
    return content;
  }
  return { ...content, content: [{ ...first, content: [{ type: 'text', text: title }] }, ...content.content.slice(1)] };
}
