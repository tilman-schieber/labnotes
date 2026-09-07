// Explicit extension so Node's type-stripping test runner can resolve it.
import { convert, findUnit, type Quantity } from '../units/quantity.ts';

export type ComponentRole = 'reactant' | 'reagent' | 'catalyst' | 'solvent' | 'product';

export const COMPONENT_ROLES: ComponentRole[] = ['reactant', 'reagent', 'catalyst', 'solvent', 'product'];

// One row of a reaction table. All user-entered fields are optional; derived values are computed.
export type ReactionComponent = {
  id: string;
  role: ComponentRole;
  // Where the role came from: read from the prose (and open to a better guess) or set by hand.
  roleSource?: 'text' | 'user';
  entityId: string | null;
  // A particular lot of the compound: the batch consumed (reactants) or registered (products).
  batchId?: string | null;
  batchCode?: string | null;
  label: string;
  molecularWeight: number | null;
  // Hydrated from the registry compound; used for the scheme and the export, never typed.
  smiles?: string | null;
  equivalents: number | null;
  mass: Quantity | null;
  volume: Quantity | null;
  // An amount of substance stated directly ("10.0 mmol"), used when nothing more direct is known
  // and cross-checked against mass and MW when both are there.
  amount?: Quantity | null;
  // g/mL, for neat liquids entered by volume
  density: number | null;
  // mol/L for solutions entered by volume; mass per volume (mg/mL) needs the MW; wt% needs the
  // density (or a mass) of the mixture.
  concentration: Quantity | null;
  // Assay of the material in percent; scales the amount when it was derived from a mass or a
  // neat volume.
  purity?: number | null;
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
  // products only: mmol actually isolated, from the isolated mass and MW
  actualMmol: number | null;
  yieldPercent: number | null;
  isLimiting: boolean;
};

// Something the numbers do not add up to; `componentId` is null for table-wide problems.
export type ReactionWarning = { componentId: string | null; message: string };

export type ReactionSummary = {
  components: ComputedComponent[];
  limitingId: string | null;
  // How the limiting reagent was chosen: marked by hand, or the reactant with the fewest equivalents.
  limitingRule: 'explicit' | 'lowest' | null;
  warnings: ReactionWarning[];
};

export function createComponent(role: ComponentRole, overrides: Partial<ReactionComponent> = {}): ReactionComponent {
  return {
    id: `c-${Math.random().toString(36).slice(2, 9)}`,
    role,
    entityId: null,
    label: '',
    molecularWeight: null,
    smiles: null,
    equivalents: role === 'product' ? 1 : null,
    mass: null,
    volume: null,
    amount: null,
    density: null,
    concentration: null,
    purity: null,
    limiting: false,
    actualMass: null,
    ...overrides
  };
}

const grams = (mass: Quantity) => convert(mass, 'g').value;
const millilitres = (volume: Quantity) => convert(volume, 'mL').value;
const millimoles = (amount: Quantity) => convert(amount, 'mmol').value;

// Tolerance for "the mass and the stated mmol describe the same amount".
const CROSS_CHECK_TOLERANCE = 0.02;

// Grams of the substance itself in the row, before any assay correction.
function gramsOfSubstance(component: ReactionComponent): number | null {
  const { mass, volume, density, concentration } = component;
  const concentrationUnit = concentration ? findUnit(concentration.unit) : null;
  const dimension = concentrationUnit?.dimension;

  if (mass && dimension === 'ratio' && concentrationUnit?.symbol === 'wt%') {
    return grams(mass) * convert(concentration as Quantity, 'wt%').value / 100;
  }
  if (mass) {
    return grams(mass);
  }
  if (volume && dimension === 'massConcentration') {
    return (millilitres(volume) / 1000) * convert(concentration as Quantity, 'g/L').value;
  }
  if (volume && dimension === 'ratio' && concentrationUnit?.symbol === 'wt%' && density) {
    return millilitres(volume) * density * convert(concentration as Quantity, 'wt%').value / 100;
  }
  if (volume && density && dimension !== 'concentration') {
    return millilitres(volume) * density;
  }
  return null;
}

function purityFactor(component: ReactionComponent): number {
  const purity = component.purity;
  return typeof purity === 'number' && purity > 0 && purity <= 100 ? purity / 100 : 1;
}

// mmol from whatever the user entered, in order of directness.
function directMmol(component: ReactionComponent): number | null {
  const { volume, molecularWeight, concentration, amount } = component;
  const concentrationDimension = concentration ? findUnit(concentration.unit)?.dimension : null;

  if (volume && concentration && concentrationDimension === 'concentration') {
    return (millilitres(volume) / 1000) * convert(concentration, 'M').value * 1000;
  }
  const substance = gramsOfSubstance(component);
  if (substance !== null && molecularWeight) {
    return (substance * purityFactor(component) / molecularWeight) * 1000;
  }
  if (amount) {
    return millimoles(amount);
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

// A reactant the chemist weighed (or took from a molar solution, or wrote as mmol) rather than
// poured: those are the rows a limiting reagent is chosen among; neat liquids measured by volume
// are usually the partner in excess, or a catalyst nobody labelled.
function isMeasuredByAmount(component: ReactionComponent): boolean {
  if (component.mass || component.amount) {
    return true;
  }
  return Boolean(component.volume && component.concentration && findUnit(component.concentration.unit)?.dimension === 'concentration');
}

// The limiting reagent: the reactant marked by hand, else the weighed reactant with the fewest
// equivalents relative to its stated stoichiometry (mmol / equiv), else the first with an amount.
function chooseLimiting(components: ReactionComponent[], direct: Map<string, number | null>): { limiting: ReactionComponent | null; rule: ReactionSummary['limitingRule'] } {
  const withAmount = components.filter((component) => component.role === 'reactant' && (direct.get(component.id) ?? null) !== null);
  const explicit = withAmount.find((component) => component.limiting);
  if (explicit) {
    return { limiting: explicit, rule: 'explicit' };
  }
  if (withAmount.length === 0) {
    return { limiting: null, rule: null };
  }
  const weighed = withAmount.filter(isMeasuredByAmount);
  const candidates = weighed.length > 0 ? weighed : withAmount;
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = (direct.get(candidate.id) as number) / (candidate.equivalents && candidate.equivalents > 0 ? candidate.equivalents : 1);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return { limiting: best, rule: candidates.length > 1 ? 'lowest' : 'explicit' };
}

export function computeReaction(components: ReactionComponent[]): ReactionSummary {
  const direct = new Map(components.map((component) => [component.id, directMmol(component)]));
  const { limiting, rule } = chooseLimiting(components, direct);
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
    let actualMmol: number | null = null;
    let yieldPercent: number | null = null;
    if (component.role === 'product') {
      if (component.actualMass && component.molecularWeight) {
        actualMmol = round((grams(component.actualMass) * purityFactor(component) / component.molecularWeight) * 1000, 5);
      }
      if (limitingMmol !== null) {
        const theoreticalMmol = limitingMmol * (component.equivalents ?? 1);
        amountMmol = theoreticalMmol;
        theoreticalMass = massFromMmol(theoreticalMmol, component.molecularWeight);
        if (actualMmol !== null) {
          yieldPercent = round((actualMmol / theoreticalMmol) * 100, 4);
        }
      }
    }

    return {
      ...component,
      amountMmol: amountMmol === null ? null : round(amountMmol, 5),
      computedEquivalents,
      computedMass,
      theoreticalMass,
      actualMmol,
      yieldPercent,
      isLimiting: limiting?.id === component.id
    };
  });

  return { components: computed, limitingId: limiting?.id ?? null, limitingRule: limiting ? rule : null, warnings: checkReaction(computed, limiting) };
}

// Mass-balance sanity checks a chemist would make by eye.
function checkReaction(components: ComputedComponent[], limiting: ReactionComponent | null): ReactionWarning[] {
  const warnings: ReactionWarning[] = [];
  const name = (component: ReactionComponent) => component.label.trim() || 'unnamed row';
  const hasAnyAmount = components.some((component) => component.role !== 'product' && (component.mass || component.volume || component.amount));

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
    if (component.volume && !component.mass && component.amountMmol === null) {
      const concentrationDimension = component.concentration ? findUnit(component.concentration.unit)?.dimension : null;
      const hint =
        concentrationDimension === 'massConcentration' || (component.concentration && findUnit(component.concentration.unit)?.symbol === 'wt%')
          ? 'add the MW (and the density for wt%)'
          : 'add a concentration, or density plus MW';
      warnings.push({ componentId: component.id, message: `${name(component)}: a volume alone gives no amount — ${hint}.` });
    }
    // The text said "1.22 g (10.0 mmol)" but the MW makes that 9.7 mmol: one of the three is off.
    if (component.amount && component.mass && component.molecularWeight) {
      const fromMass = (grams(component.mass) * purityFactor(component) / component.molecularWeight) * 1000;
      const stated = millimoles(component.amount);
      if (stated > 0 && Math.abs(fromMass - stated) / stated > CROSS_CHECK_TOLERANCE) {
        warnings.push({
          componentId: component.id,
          message: `${name(component)}: ${component.mass.value} ${component.mass.unit} is ${round(fromMass, 3)} mmol at MW ${component.molecularWeight}, but the text says ${round(stated, 3)} mmol.`
        });
      }
    }
  }

  return warnings;
}
