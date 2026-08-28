import { findUnit, type Quantity } from '../units/quantity.ts';
import { createComponent, type ComponentRole, type ReactionComponent } from './reaction.ts';
import { extractUsages, summariseUsages, type Usage } from './usages.ts';

type JsonNode = { type?: string; content?: JsonNode[]; attrs?: Record<string, unknown> };

// The blocks a reaction table describes: everything after the previous heading up to the
// insertion point (exclusive), so one section = one reaction.
export function sectionBlocksBefore(blocks: JsonNode[], index: number): JsonNode[] {
  let start = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (blocks[cursor]?.type === 'heading') {
      start = cursor;
      break;
    }
  }
  return blocks.slice(start, index);
}

function pick(quantities: Quantity[], dimension: string): Quantity | null {
  return quantities.find((quantity) => findUnit(quantity.unit)?.dimension === dimension) ?? null;
}

function roleOf(usage: Usage): ComponentRole {
  if (usage.role === 'product' || usage.role === 'solvent') {
    return usage.role;
  }
  // Amounts given only as equivalents read as reagents; masses/volumes as reactants.
  const onlyRatio = usage.quantities.length > 0 && usage.quantities.every((quantity) => findUnit(quantity.unit)?.dimension === 'ratio');
  return onlyRatio ? 'reagent' : 'reactant';
}

// Turns the prose of a section into reaction rows. Documents are never components.
export function componentsFromBlocks(blocks: JsonNode[]): ReactionComponent[] {
  const usages = summariseUsages(extractUsages({ type: 'doc', content: blocks })).filter((usage) => usage.entityType !== 'document');

  return usages.map((usage) =>
    createComponent(roleOf(usage), {
      entityId: usage.entityId,
      label: usage.label,
      mass: usage.role === 'product' ? null : pick(usage.quantities, 'mass'),
      actualMass: usage.role === 'product' ? pick(usage.quantities, 'mass') : null,
      volume: pick(usage.quantities, 'volume'),
      concentration: pick(usage.quantities, 'concentration'),
      equivalents: pick(usage.quantities, 'ratio')?.value ?? (usage.role === 'product' ? 1 : null)
    })
  );
}

// Adds rows for entities the table does not have yet and fills empty amount fields on rows it
// does; never removes or overwrites what the user entered by hand.
export function mergeComponents(existing: ReactionComponent[], fromText: ReactionComponent[]): ReactionComponent[] {
  const merged = existing.map((component) => {
    const update = fromText.find((candidate) => candidate.entityId && candidate.entityId === component.entityId);
    if (!update) {
      return component;
    }
    return {
      ...component,
      mass: component.mass ?? update.mass,
      volume: component.volume ?? update.volume,
      concentration: component.concentration ?? update.concentration,
      actualMass: component.actualMass ?? update.actualMass,
      equivalents: component.equivalents ?? update.equivalents
    };
  });

  const known = new Set(existing.map((component) => component.entityId).filter(Boolean));
  const additions = fromText.filter((candidate) => !known.has(candidate.entityId));
  // Drop untouched placeholder rows when real rows arrive.
  const withoutBlanks = additions.length > 0 ? merged.filter((component) => component.entityId || component.label.trim()) : merged;
  return [...withoutBlanks, ...additions];
}
