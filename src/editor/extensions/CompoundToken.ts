import type { NodeViewRenderer } from '@tiptap/core';
import { fetchEntity, type BackendEntityDetail, type BackendEntityRecord } from '../../api/backend';
import { formatWeight, isCompoundAttributes, smilesToSvg, type CompoundAttributes } from '../../chemistry/molecule';
import { expiryState } from '../../registry/attributeSchema';
import { entityType, onEntityTypes } from '../entityTypes';
import { stockState } from '../../registry/stock';
import { formatQuantity } from '../../units/quantity';
import { isChemical } from '../../registry/typeCatalog';

// Entity details are fetched lazily on hover and cached per session, so tokens always show the
// registry's current structure without storing SMILES in the document.
const entityCache = new Map<string, Promise<BackendEntityDetail | null>>();

export function loadEntityDetail(id: string) {
  let pending = entityCache.get(id);
  if (!pending) {
    pending = fetchEntity(id).catch(() => {
      entityCache.delete(id);
      return null;
    });
    entityCache.set(id, pending);
  }
  return pending;
}

export function loadEntity(id: string): Promise<BackendEntityRecord | null> {
  return loadEntityDetail(id).then((detail) => detail?.entity ?? null);
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

function line(className: string, text: string) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

// "Danger · GHS05 GHS07 · H314 H335" from a stored GHS summary; null when nothing is known.
export function describeGhs(attributes: Record<string, unknown> | null | undefined): { text: string; level: 'danger' | 'warning' | 'info' } | null {
  const ghs = attributes?.ghs as { signalWord?: string | null; pictograms?: string[]; hStatements?: { code: string }[] } | null | undefined;
  if (!ghs || typeof ghs !== 'object') {
    return null;
  }
  const codes = (ghs.hStatements ?? []).map((statement) => statement.code);
  const parts = [ghs.signalWord, (ghs.pictograms ?? []).join(' '), codes.join(' ')].filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return { text: parts.join(' · '), level: ghs.signalWord === 'Danger' ? 'danger' : ghs.signalWord === 'Warning' ? 'warning' : 'info' };
}

// What a writer needs to know about a reference without leaving the text: the structure for
// compounds, and for anything with stock or an expiry, whether it is still usable.
async function showHoverCard(anchor: HTMLElement, entityId: string) {
  const detail = await loadEntityDetail(entityId);
  if (!detail || !anchor.matches(':hover')) {
    return;
  }
  const { entity } = detail;
  // A batch draws its compound's structure and says where it was made.
  const structureSource = entity.type === 'batch' && detail.parent ? detail.parent.attributes : entity.attributes;
  const attributes = isCompoundAttributes(structureSource) ? (structureSource as CompoundAttributes) : null;
  const svg = attributes?.smiles ? await smilesToSvg(attributes.smiles, 220, 140) : null;
  if (!anchor.matches(':hover')) {
    return;
  }

  const card = getHoverCard();
  card.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'compound-hover-head';
  const badge = line(`badge type-badge type-${entity.type}`, entity.type);
  head.append(badge, line('compound-hover-label', entity.label));
  card.appendChild(head);

  if (svg) {
    const image = document.createElement('div');
    image.className = 'compound-hover-svg';
    image.innerHTML = svg;
    card.appendChild(image);
    const formula = [attributes?.formula, formatWeight(attributes?.molecularWeight)].filter(Boolean).join(' · ');
    if (formula) {
      card.appendChild(line('compound-hover-meta', formula));
    }
  }

  if (entity.type === 'batch') {
    const made = detail.madeIn ? `made in ${detail.madeIn.number ? `Exp ${String(detail.madeIn.number).padStart(3, '0')}` : detail.madeIn.title}` : null;
    const of = detail.parent ? `batch of ${detail.parent.label}` : null;
    const note = [of, made].filter(Boolean).join(' · ');
    if (note) {
      card.appendChild(line('compound-hover-meta', note));
    }
  }

  const ghs = describeGhs((entity.type === 'batch' ? detail.parent?.attributes : entity.attributes) as Record<string, unknown> | undefined);
  if (ghs) {
    card.appendChild(line(`compound-hover-meta hazard-${ghs.level}`, ghs.text));
  }

  const stock = stockState(entity.attributes, detail.usageTotals);
  if (stock) {
    card.appendChild(
      line(
        `compound-hover-meta stock-${stock.level}`,
        `${formatQuantity(stock.remaining)} left of ${formatQuantity(stock.initial)}${stock.level === 'depleted' ? ' — used up' : stock.level === 'low' ? ' — running low' : ''}`
      )
    );
  }

  const expiry = expiryState(entity.attributes);
  if (expiry) {
    card.appendChild(line(`compound-hover-meta stock-${expiry === 'expired' ? 'depleted' : 'low'}`, `${expiry === 'expired' ? 'Expired' : 'Expires soon'} (${String(entity.attributes.expiry)})`));
  }

  if (detail.backlinks.length > 0) {
    card.appendChild(line('compound-hover-meta', `Referenced in ${detail.backlinks.length} ${detail.backlinks.length === 1 ? 'document' : 'documents'}`));
  }

  const rect = anchor.getBoundingClientRect();
  card.style.left = `${rect.left + window.scrollX}px`;
  card.style.top = `${rect.bottom + window.scrollY + 6}px`;
  card.hidden = false;
}

// Renders the `#label` token; compound tokens get a hover card and can toggle an inline structure.
export const compoundTokenNodeView: NodeViewRenderer = ({ node, getPos, editor }) => {
  const dom = document.createElement('span');
  // The registry's current type, falling back to the one stored in the document.
  let type = entityType(node.attrs.id, String(node.attrs.entityType ?? 'entity'));
  let isDocument = type === 'document';
  let isCompound = isChemical(type);

  const applyType = () => {
    type = entityType(node.attrs.id, String(node.attrs.entityType ?? 'entity'));
    isDocument = type === 'document';
    isCompound = isChemical(type);
    dom.className = `mention reference-token reference-entity${isCompound ? ' reference-compound' : ''}${isDocument ? ' reference-document' : ''}`;
    dom.setAttribute('data-entity-type', type);
    dom.title = isCompound ? 'Hover for structure · click to toggle inline structure' : '';
  };

  applyType();
  const unsubscribe = onEntityTypes(() => {
    applyType();
    void renderInline();
  });
  dom.setAttribute('data-id', String(node.attrs.id ?? ''));
  dom.setAttribute('data-type', 'entityMention');

  const label = document.createElement('span');
  label.className = 'reference-label';
  label.textContent = `#${node.attrs.label ?? node.attrs.id ?? ''}`;
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

  dom.addEventListener('mouseenter', () => {
    if (!isDocument) {
      void showHoverCard(dom, String(node.attrs.id));
    }
  });
  dom.addEventListener('mouseleave', hideHoverCard);

  // Clicking a compound toggles its inline structure; other tokens ignore the click.
  dom.addEventListener('click', (event) => {
    if (!editor.isEditable || !isCompound) {
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

  return {
    dom,
    update: (updated) => {
      if (updated.type !== node.type) {
        return false;
      }
      node = updated;
      label.textContent = `#${node.attrs.label ?? node.attrs.id ?? ''}`;
      applyType();
      void renderInline();
      return true;
    },
    destroy: () => {
      unsubscribe();
      hideHoverCard();
    }
  };
};
