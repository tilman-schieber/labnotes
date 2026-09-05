// Explicit extension so Node's type-stripping test runner can resolve it.
import { convert, type Quantity } from '../units/quantity.ts';

export type ComponentRole = 'reactant' | 'reagent' | 'solvent' | 'product';

export const COMPONENT_ROLES: ComponentRole[] = ['reactant', 'reagent', 'solvent', 'product'];

// One row of a reaction table. All user-entered fields are optional; derived values are computed.
export type ReactionComponent = {
  id: string;
  role: ComponentRole;
  entityId: string | null;
  label: string;
  molecularWeight: number | null;
  equivalents: number | null;
  mass: Quantity | null;
  volume: Quantity | null;
  // g/mL, for neat liquids entered by volume
  density: number | null;
  // mol/L, for solutions entered by volume
  concentration: Quantity | null;
  limiting: boolean;
  // products only: what was actually isolated
  actualMass: Quantity | null;
  // Where a row created from prose was read from.
  source?: { sentence: string } | null;
};

export type ComputedComponent = ReactionComponent & {
  amountMmol: number | null;
  computedEquivalents: number | null;
  computedMass: Quantity | null;
  theoreticalMass: Quantity | null;
  yieldPercent: number | null;
  isLimiting: boolean;
};

// Something the numbers do not add up to; `componentId` is null for table-wide problems.
export type ReactionWarning = { componentId: string | null; message: string };

export type ReactionSummary = {
  components: ComputedComponent[];
  limitingId: string | null;
  warnings: ReactionWarning[];
};

export function createComponent(role: ComponentRole, overrides: Partial<ReactionComponent> = {}): ReactionComponent {
  return {
    id: `c-${Math.random().toString(36).slice(2, 9)}`,
    role,
    entityId: null,
    label: '',
    molecularWeight: null,
    equivalents: role === 'product' ? 1 : null,
    mass: null,
    volume: null,
    density: null,
    concentration: null,
    limiting: false,
    actualMass: null,
    ...overrides
  };
}

const grams = (mass: Quantity) => convert(mass, 'g').value;
const millilitres = (volume: Quantity) => convert(volume, 'mL').value;
const molar = (concentration: Quantity) => convert(concentration, 'M').value;

// mmol from whatever the user entered, in order of directness.
function directMmol(component: ReactionComponent): number | null {
  const { mass, volume, molecularWeight, density, concentration } = component;

  if (mass && molecularWeight) {
    return (grams(mass) / molecularWeight) * 1000;
  }
  if (volume && concentration) {
    return (millilitres(volume) / 1000) * molar(concentration) * 1000;
  }
  if (volume && density && molecularWeight) {
    return ((millilitres(volume) * density) / molecularWeight) * 1000;
  }
  return null;
}

function massFromMmol(mmol: number, molecularWeight: number | null): Quantity | null {
  if (!molecularWeight) {
    return null;
  }
  const gramsValue = (mmol / 1000) * molecularWeight;
  const mg = gramsValue * 1000;
  return mg < 1000 ? { value: round(mg, 4), unit: 'mg' } : { value: round(gramsValue, 4), unit: 'g' };
}

function round(value: number, digits: number) {
  return Number(value.toPrecision(digits));
}

export function computeReaction(components: ReactionComponent[]): ReactionSummary {
  const direct = new Map(components.map((component) => [component.id, directMmol(component)]));

  // Limiting reagent: explicit flag, else the first reactant with a directly known amount.
  const candidates = components.filter((component) => component.role === 'reactant');
  const limiting =
    candidates.find((component) => component.limiting && direct.get(component.id) !== null) ??
    candidates.find((component) => direct.get(component.id) !== null) ??
    null;
  const limitingMmol = limiting ? direct.get(limiting.id) ?? null : null;

  const computed = components.map<ComputedComponent>((component) => {
    let amountMmol = direct.get(component.id) ?? null;
    let computedMass: Quantity | null = null;

    if (amountMmol === null && component.equivalents !== null && limitingMmol !== null && component.role !== 'product') {
      amountMmol = component.equivalents * limitingMmol;
      computedMass = massFromMmol(amountMmol, component.molecularWeight);
    }

    const computedEquivalents = amountMmol !== null && limitingMmol ? round(amountMmol / limitingMmol, 4) : component.equivalents;

    let theoreticalMass: Quantity | null = null;
    let yieldPercent: number | null = null;
    if (component.role === 'product' && limitingMmol !== null) {
      const theoreticalMmol = limitingMmol * (component.equivalents ?? 1);
      amountMmol = theoreticalMmol;
      theoreticalMass = massFromMmol(theoreticalMmol, component.molecularWeight);
      if (component.actualMass && theoreticalMass) {
        yieldPercent = round((grams(component.actualMass) / grams(theoreticalMass)) * 100, 4);
      }
    }

    return {
      ...component,
      amountMmol: amountMmol === null ? null : round(amountMmol, 5),
      computedEquivalents,
      computedMass,
      theoreticalMass,
      yieldPercent,
      isLimiting: limiting?.id === component.id
    };
  });

  return { components: computed, limitingId: limiting?.id ?? null, warnings: checkReaction(computed, limiting) };
}

// Mass-balance sanity checks a chemist would make by eye.
function checkReaction(components: ComputedComponent[], limiting: ReactionComponent | null): ReactionWarning[] {
  const warnings: ReactionWarning[] = [];
  const name = (component: ReactionComponent) => component.label.trim() || 'unnamed row';
  const hasAnyAmount = components.some((component) => component.role !== 'product' && (component.mass || component.volume));

  if (!limiting && components.some((component) => component.role === 'reactant') && hasAnyAmount) {
    warnings.push({ componentId: null, message: 'No reactant has a computable amount, so equivalents and yields cannot be derived. Add a mass and MW (or volume and concentration) to one reactant.' });
  }

  for (const component of components) {
    if (component.role === 'product') {
      if (component.yieldPercent !== null && component.yieldPercent > 100) {
        warnings.push({ componentId: component.id, message: `${name(component)}: yield is ${component.yieldPercent}% — above 100%. Check the isolated mass, the product MW, or which reagent is limiting.` });
      }
      if (component.theoreticalMass && !component.actualMass) {
        warnings.push({ componentId: component.id, message: `${name(component)}: no isolated mass recorded, so no yield.` });
      }
      if (limiting && !component.molecularWeight) {
        warnings.push({ componentId: component.id, message: `${name(component)}: MW missing, so the theoretical mass cannot be computed.` });
      }
      continue;
    }
    if (component.role === 'solvent') {
      continue;
    }
    if (component.mass && !component.molecularWeight) {
      warnings.push({ componentId: component.id, message: `${name(component)}: MW missing, so its mmol cannot be computed from the mass.` });
    }
    if (component.volume && !component.mass && !component.concentration && !(component.density && component.molecularWeight)) {
      warnings.push({ componentId: component.id, message: `${name(component)}: a volume alone gives no amount — add a concentration, or density plus MW.` });
    }
  }

  return warnings;
}
