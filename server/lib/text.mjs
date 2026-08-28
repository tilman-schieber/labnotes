// Flattens TipTap JSON into plain text for full-text indexing and exports. Tokens that carry
// meaning outside their text (mentions, quantities, reaction rows, math) are spelled out.
export function extractText(content) {
  const parts = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    switch (node.type) {
      case 'text':
        parts.push(node.text ?? '');
        return;
      case 'entityMention':
      case 'userMention':
        parts.push(String(node.attrs?.label ?? ''));
        return;
      case 'quantity':
        parts.push(`${node.attrs?.value ?? ''} ${node.attrs?.unit ?? ''}`.trim());
        return;
      case 'inlineMath':
      case 'blockMath':
        parts.push(String(node.attrs?.latex ?? ''));
        return;
      case 'reaction': {
        const components = Array.isArray(node.attrs?.components) ? node.attrs.components : [];
        parts.push([node.attrs?.title, ...components.map((component) => component?.label)].filter(Boolean).join(' '));
        parts.push('\n');
        return;
      }
      default:
        break;
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(visit);
    }

    // Block boundaries become line breaks so words from adjacent blocks do not fuse.
    if (node.type && node.type !== 'doc' && !node.type.startsWith('table')) {
      parts.push('\n');
    }
  };

  visit(content);
  return parts
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
