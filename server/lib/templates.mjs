export function createTemplateDocument(kind, title) {
  if (kind === 'protocol') {
    return {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
        { type: 'paragraph' }
      ]
    };
  }

  return {
    type: 'doc',
    content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }]
  };
}
