import type { NodeViewRenderer } from '@tiptap/core';
import { fetchEntity, type BackendEntityRecord } from '../../api/backend';
import { formatWeight, isCompoundAttributes, smilesToSvg, type CompoundAttributes } from '../../chemistry/molecule';

// Entity details are fetched lazily on hover and cached per session, so tokens always show the
// registry's current structure without storing SMILES in the document.
const entityCache = new Map<string, Promise<BackendEntityRecord | null>>();

export function loadEntity(id: string) {
  let pending = entityCache.get(id);
  if (!pending) {
    pending = fetchEntity(id)
      .then((detail) => detail.entity)
      .catch(() => {
        entityCache.delete(id);
        return null;
      });
    entityCache.set(id, pending);
  }
  return pending;
}

export function invalidateEntityCache(id?: string) {
  if (id) {
    entityCache.delete(id);
  } else {
    entityCache.clear();
  }
}

let hoverCard: HTMLDivElement | null = null;

function getHoverCard() {
  if (!hoverCard) {
    hoverCard = document.createElement('div');
    hoverCard.className = 'compound-hover-card';
    hoverCard.style.position = 'absolute';
    hoverCard.style.zIndex = '1000';
    hoverCard.hidden = true;
    document.body.appendChild(hoverCard);
  }
  return hoverCard;
}

function hideHoverCard() {
  if (hoverCard) {
    hoverCard.hidden = true;
  }
}

async function showHoverCard(anchor: HTMLElement, entityId: string) {
  const entity = await loadEntity(entityId);
  const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
  if (!entity || !attributes?.smiles || !anchor.matches(':hover')) {
    return;
  }

  const svg = await smilesToSvg(attributes.smiles, 220, 140);
  if (!anchor.matches(':hover')) {
    return;
  }

  const card = getHoverCard();
  card.innerHTML = '';

  const image = document.createElement('div');
  image.className = 'compound-hover-svg';
  image.innerHTML = svg ?? '';

  const meta = document.createElement('div');
  meta.className = 'compound-hover-meta';
  meta.textContent = [attributes.formula, formatWeight(attributes.molecularWeight)].filter(Boolean).join(' · ');

  card.append(image, meta);

  const rect = anchor.getBoundingClientRect();
  card.style.left = `${rect.left + window.scrollX}px`;
  card.style.top = `${rect.bottom + window.scrollY + 6}px`;
  card.hidden = false;
}

// Renders the `#label` token; compound tokens get a hover card and can toggle an inline structure.
export const compoundTokenNodeView: NodeViewRenderer = ({ node, getPos, editor }) => {
  const dom = document.createElement('span');
  const isDocument = node.attrs.entityType === 'document';
  const isCompound = node.attrs.entityType === 'compound';
  dom.className = `mention reference-token reference-entity${isCompound ? ' reference-compound' : ''}`;
  dom.setAttribute('data-id', String(node.attrs.id ?? ''));
  dom.setAttribute('data-type', 'entityMention');

  const label = document.createElement('span');
  label.className = 'reference-label';
  label.textContent = `${isDocument ? '/' : '#'}${node.attrs.label ?? node.attrs.id ?? ''}`;
  dom.appendChild(label);

  let inlineHost: HTMLSpanElement | null = null;

  const renderInline = async () => {
    if (!node.attrs.inlineStructure) {
      inlineHost?.remove();
      inlineHost = null;
      return;
    }

    const entity = await loadEntity(String(node.attrs.id));
    const attributes = entity && isCompoundAttributes(entity.attributes) ? (entity.attributes as CompoundAttributes) : null;
    const svg = attributes?.smiles ? await smilesToSvg(attributes.smiles, 120, 60) : null;
    if (!svg) {
      return;
    }

    if (!inlineHost) {
      inlineHost = document.createElement('span');
      inlineHost.className = 'reference-inline-structure';
      inlineHost.contentEditable = 'false';
      dom.appendChild(inlineHost);
    }
    inlineHost.innerHTML = svg;
  };

  if (isCompound) {
    dom.title = 'Hover for structure · click to toggle inline structure';
    dom.addEventListener('mouseenter', () => void showHoverCard(dom, String(node.attrs.id)));
    dom.addEventListener('mouseleave', hideHoverCard);
    dom.addEventListener('click', (event) => {
      if (!editor.isEditable) {
        return;
      }
      event.preventDefault();
      const position = typeof getPos === 'function' ? getPos() : null;
      if (position === null || position === undefined) {
        return;
      }
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, inlineStructure: !node.attrs.inlineStructure })
      );
    });
    void renderInline();
  }

  return {
    dom,
    update: (updated) => {
      if (updated.type !== node.type) {
        return false;
      }
      node = updated;
      label.textContent = `${isDocument ? '/' : '#'}${node.attrs.label ?? node.attrs.id ?? ''}`;
      if (isCompound) {
        void renderInline();
      }
      return true;
    },
    destroy: hideHoverCard
  };
};
