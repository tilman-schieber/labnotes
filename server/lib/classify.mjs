// Filling in entities nobody has classified yet. Two deterministic sources, in order:
//
//   1. the head noun of the name ("Lysis Buffer" -> reagent, "centrifuge tube" -> container),
//   2. PubChem, which answers for real substances and 404s for everything else.
//
// Nothing here guesses beyond those two, and every write records where the value came from in
// `attributes.autoClassify`, so a reviewer can tell an automatic fill from a human one.
import { query, withTransaction } from './database.mjs';
import { mergeEntities } from './entities.mjs';
import { densityFor } from '../../src/chemistry/densities.ts';

const AUTO_CLASSIFY = process.env.AUTO_CLASSIFY !== 'false';
const INTERVAL_MS = Number(process.env.AUTO_CLASSIFY_INTERVAL_SECONDS ?? 120) * 1000;
// PubChem asks for at most 5 requests a second; one entity costs up to two.
const REQUEST_GAP_MS = Number(process.env.AUTO_CLASSIFY_GAP_MS ?? 400);
const BATCH = 25;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
// GHS hazard summaries from PubChem's view service; off when a lab must not fetch them.
const AUTO_CLASSIFY_GHS = process.env.AUTO_CLASSIFY_GHS !== 'false';

// Head nouns that settle the type without asking anyone. Multi-word entries are matched against
// the last two words first, so "plate reader" beats "plate".
const KEYWORDS = {
  reagent: [
    'buffer', 'medium', 'media', 'broth', 'agar', 'solution', 'reagent', 'master mix', 'mastermix', 'serum', 'antibody',
    'enzyme', 'primer', 'stain', 'dye', 'ladder', 'marker', 'kit', 'mix', 'stock solution', 'growth medium'
  ],
  instrument: [
    'centrifuge', 'microscope', 'spectrometer', 'spectrophotometer', 'hplc', 'lcms', 'gcms', 'nmr', 'incubator', 'shaker',
    'thermocycler', 'cycler', 'balance', 'autoclave', 'sonicator', 'pump', 'reader', 'plate reader', 'evaporator',
    'rotary evaporator', 'rotavap', 'ph meter', 'water bath', 'freeze dryer', 'lyophilizer', 'analyzer', 'analyser'
  ],
  container: [
    'tube', 'vial', 'flask', 'bottle', 'plate', 'well', 'box', 'rack', 'freezer', 'fridge', 'refrigerator', 'dewar',
    'cabinet', 'column', 'cartridge', 'beaker', 'dish', 'cryobox', 'canister'
  ],
  location: ['room', 'lab', 'laboratory', 'bench', 'building', 'floor', 'hood', 'fume hood', 'bay', 'shelf', 'site'],
  sample: [
    'sample', 'specimen', 'isolate', 'biopsy', 'aliquot', 'lysate', 'culture', 'cell culture', 'strain', 'extract',
    'fraction', 'supernatant', 'pellet', 'slide'
  ]
};

const LOOKUP = new Map();
for (const [type, words] of Object.entries(KEYWORDS)) {
  for (const word of words) {
    LOOKUP.set(word, type);
  }
}

function singular(word) {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

// The type a name gives away on its own, or null when the name says nothing.
export function classifyByName(label) {
  const words = (String(label ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(singular);
  if (words.length === 0) {
    return null;
  }

  const candidates = [];
  if (words.length >= 2) {
    candidates.push(`${words[words.length - 2]} ${words[words.length - 1]}`);
  }
  // The head noun of an English name is its last word; everything before it only qualifies it.
  for (let index = words.length - 1; index >= 0; index -= 1) {
    candidates.push(words[index]);
  }

  for (const candidate of candidates) {
    const type = LOOKUP.get(candidate);
    if (type) {
      return { type, matched: candidate };
    }
  }

  return null;
}

const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

// Only ever adds; a value a human typed is never overwritten.
function fillBlanks(attributes, values) {
  const next = { ...attributes };
  let filled = 0;
  for (const [key, value] of Object.entries(values)) {
    const missing = next[key] === undefined || next[key] === null || next[key] === '';
    if (missing && value !== undefined && value !== null && value !== '') {
      next[key] = value;
      filled += 1;
    }
  }
  return { attributes: next, filled };
}

async function describeSmilesSafely(smiles, deps) {
  const describe = deps.describeSmiles ?? (async (value) => (await import('../../src/chemistry/molecule.ts')).describeSmiles(value));
  try {
    return await describe(smiles);
  } catch {
    return null;
  }
}

/**
 * Works out what a single entity should be. Returns the patch to apply, or null when nothing
 * could be established. Throws only on network trouble, which the caller treats as "try later".
 */
export async function planClassification(entity, deps = {}) {
  const attributes = entity.attributes ?? {};
  const isUnclassified = entity.type === 'unclassified';

  if (isUnclassified) {
    const byName = classifyByName(entity.label);
    if (byName && byName.type !== 'compound') {
      return {
        type: byName.type,
        status: 'verified',
        attributes,
        provenance: { via: 'name', matched: byName.matched }
      };
    }
  }

  let next = attributes;
  let filled = 0;

  // Density and the solvent flag come from a local table of common liquids, keyed by CAS number
  // (or the name, for a draft that has no CAS yet); nothing to fetch.
  const lookupDensity = deps.densityFor ?? densityFor;
  const fromTable = (cas, label) => {
    const entry = lookupDensity({ casNumber: cas, label });
    return entry ? { density: entry.density, solvent: entry.isSolvent ? true : undefined } : {};
  };
  if (!isUnclassified) {
    const merged = fillBlanks(next, fromTable(next.casNumber, entity.label));
    next = merged.attributes;
    filled += merged.filled;
  }

  // Formula, mass and the rest follow from a structure the entity already has; no need to ask
  // anyone for those.
  if (!isUnclassified && typeof attributes.smiles === 'string' && attributes.smiles) {
    const described = await describeSmilesSafely(attributes.smiles, deps);
    if (described) {
      const merged = fillBlanks(next, described);
      next = merged.attributes;
      filled += merged.filled;
    }
  }

  // Only PubChem can supply a CAS number or a structure the entity does not have yet.
  if (isUnclassified || !next.casNumber || !next.smiles) {
    const lookup = deps.lookupCompound ?? (async (name) => (await import('../../src/chemistry/pubchem.ts')).lookupCompound(name));
    // A CAS already on the entity identifies it better than a house name does.
    const searchTerm = CAS_PATTERN.test(String(next.casNumber ?? '')) ? String(next.casNumber) : entity.label;

    let hit = null;
    try {
      hit = await lookup(searchTerm);
    } catch (error) {
      if (!(error instanceof Error) || !/not found/i.test(error.message)) {
        throw error;
      }
    }

    if (hit) {
      const described = hit.smiles ? await describeSmilesSafely(hit.smiles, deps) : null;
      const fromPubChem = {
        ...(described ?? { smiles: hit.smiles, formula: hit.formula, molecularWeight: hit.molecularWeight }),
        casNumber: hit.casNumber ?? undefined,
        iupacName: hit.iupacName ?? undefined,
        pubchemCid: hit.cid,
        ...fromTable(hit.casNumber ?? next.casNumber, entity.label)
      };
      const merged = fillBlanks(next, fromPubChem);
      next = merged.attributes;
      filled += merged.filled;

      return {
        type: 'compound',
        status: isUnclassified ? 'verified' : entity.status,
        attributes: next,
        provenance: { via: 'pubchem', matched: searchTerm, cid: hit.cid, filled }
      };
    }
  }

  // Hazards come from PubChem's view service, once per CID; "none known" is recorded so the
  // question is not asked again.
  let hazardsUnavailable = false;
  if (!isUnclassified && AUTO_CLASSIFY_GHS && next.pubchemCid && next.ghs === undefined && hazardsDue(next)) {
    const lookupHazards = deps.lookupHazards ?? (async (cid) => (await import('../../src/chemistry/pubchem.ts')).lookupHazards(cid));
    try {
      const ghs = await lookupHazards(Number(next.pubchemCid));
      next = { ...next, ghs: ghs ?? null };
      filled += 1;
    } catch {
      // PubChem's view service is often busy; note the attempt and ask again later rather than
      // stopping the whole pass.
      next = { ...next, ghsAttemptedAt: new Date().toISOString() };
      hazardsUnavailable = true;
    }
  }

  if (isUnclassified || (filled === 0 && !hazardsUnavailable)) {
    return null;
  }

  return {
    type: entity.type,
    status: entity.status,
    attributes: next,
    provenance: { via: next.smiles ? 'structure' : 'table', matched: String(next.smiles ?? next.casNumber ?? entity.label), filled }
  };
}

// Two entries for one substance: the same PubChem CID or the same canonical structure. A draft
// (or an entry the classifier itself filled in) is folded into the existing one; two entries
// people verified by hand are only reported, never merged behind their backs.
export function chooseMergeTarget(entity, duplicate) {
  if (!duplicate || duplicate.id === entity.id) {
    return { action: 'none' };
  }
  const isAutomatic = (item) => item.status === 'draft' || item.type === 'unclassified' || Boolean(item.attributes?.autoClassify?.via);
  const entityAutomatic = isAutomatic(entity);
  const duplicateAutomatic = isAutomatic(duplicate);
  if (!entityAutomatic && !duplicateAutomatic) {
    return { action: 'suggest', targetId: duplicate.id };
  }
  // The survivor: the one a person verified; failing that, the older entry.
  let survivor = duplicate;
  if (entityAutomatic && !duplicateAutomatic) {
    survivor = duplicate;
  } else if (!entityAutomatic && duplicateAutomatic) {
    survivor = entity;
  } else if (entity.createdAt && duplicate.createdAt && String(entity.createdAt) < String(duplicate.createdAt)) {
    survivor = entity;
  }
  const removed = survivor.id === entity.id ? duplicate : entity;
  return { action: 'merge', targetId: survivor.id, sourceId: removed.id };
}

async function findDuplicateEntity(entity, attributes) {
  const cid = attributes.pubchemCid ? String(attributes.pubchemCid) : null;
  const idCode = attributes.idCode ? String(attributes.idCode) : null;
  if (!cid && !idCode) {
    return null;
  }
  const result = await query(
    `
      select id, label, status, attributes
      from entities
      where id <> $1
        and document_id is null
        and type = 'compound'
        and status <> 'archived'
        and (($2::text is not null and attributes->>'pubchemCid' = $2) or ($3::text is not null and attributes->>'idCode' = $3))
      order by (status = 'verified') desc, created_at asc
      limit 1
    `,
    [entity.id, cid, idCode]
  );
  return result.rows[0] ?? null;
}

async function mergeIntoExisting(survivor, removed, plan) {
  // When the survivor is the entity being classified, its plan (chemistry, density, hazards)
  // is applied first so nothing the pass learned is lost in the merge.
  if (plan && survivor.id === plan.entityId) {
    await query('update entities set type = $2, status = $3, attributes = $4::jsonb, updated_at = now() where id = $1', [
      survivor.id,
      plan.type,
      plan.status,
      JSON.stringify(withProvenance(plan.attributes, { ...plan.provenance, result: 'classified' }, survivor.attributes?.autoClassify))
    ]);
  }
  await withTransaction((client) => mergeEntities(client, survivor.id, removed.id));
  const current = await query('select attributes from entities where id = $1', [survivor.id]);
  const attributes = withProvenance(
    current.rows[0]?.attributes ?? {},
    { via: 'merge', mergedFrom: removed.id, mergedLabel: removed.label, matched: plan?.provenance?.matched ?? removed.label, result: 'classified' },
    current.rows[0]?.attributes?.autoClassify
  );
  await query('update entities set attributes = $2::jsonb, updated_at = now() where id = $1', [survivor.id, JSON.stringify(attributes)]);
}

// Hazards are asked for again only after the usual retry gap.
function hazardsDue(attributes) {
  const attempted = attributes.ghsAttemptedAt ? Date.parse(attributes.ghsAttemptedAt) : NaN;
  return Number.isNaN(attempted) || Date.now() - attempted > RETRY_AFTER_MS;
}

function withProvenance(attributes, provenance, previous) {
  // A merge is worth remembering across later stamps (a hazard fill must not erase it).
  const merged = previous?.mergedFrom && !provenance.mergedFrom ? { mergedFrom: previous.mergedFrom, mergedLabel: previous.mergedLabel } : {};
  return {
    ...attributes,
    autoClassify: {
      ...merged,
      ...provenance,
      at: new Date().toISOString(),
      attempts: Number(previous?.attempts ?? 0) + 1
    }
  };
}

async function recordMiss(entity, reason) {
  const previous = entity.attributes?.autoClassify;
  const attributes = withProvenance(entity.attributes ?? {}, { via: null, result: reason }, previous);
  await query('update entities set attributes = $2::jsonb where id = $1', [entity.id, JSON.stringify(attributes)]);
}

async function applyPlan(entity, plan, deps = {}) {
  // Same substance already in the registry? Fold this one into it rather than keep two.
  if (plan.type === 'compound') {
    const findDuplicate = deps.findDuplicate ?? findDuplicateEntity;
    const duplicate = await findDuplicate(entity, plan.attributes);
    const decision = chooseMergeTarget(entity, duplicate);
    if (decision.action === 'merge') {
      const survivor = decision.targetId === entity.id ? entity : duplicate;
      const removed = decision.sourceId === entity.id ? entity : duplicate;
      await (deps.merge ?? mergeIntoExisting)(survivor, removed, { ...plan, entityId: entity.id });
      return { id: survivor.id, label: survivor.label, type: 'compound', via: 'merge', mergedFrom: removed.id, mergedLabel: removed.label };
    }
    if (decision.action === 'suggest') {
      plan = { ...plan, provenance: { ...plan.provenance, duplicateOf: duplicate.id } };
    }
  }

  const previous = entity.attributes?.autoClassify;
  const attributes = withProvenance(plan.attributes, { ...plan.provenance, result: 'classified' }, previous);
  await query(
    `
      update entities
      set type = $2,
          status = $3,
          attributes = $4::jsonb,
          updated_at = now()
      where id = $1
    `,
    [entity.id, plan.type, plan.status, JSON.stringify(attributes)]
  );
  return { id: entity.id, label: entity.label, type: plan.type, via: plan.provenance.via };
}

// Entities worth a look: names nobody has typed, and compounds missing the chemistry that
// PubChem could supply. Filtering happens in JS so the query stays dialect-neutral.
export async function pendingEntities({ force = false, id = null } = {}) {
  const result = await query(
    `
      select id, type, status, label, attributes, created_at as "createdAt"
      from entities
      where document_id is null
        and status <> 'archived'
        and (type = 'unclassified' or type = 'compound')
        ${id ? 'and id = $1' : ''}
      order by created_at asc
    `,
    id ? [id] : []
  );

  const now = Date.now();
  return result.rows.filter((entity) => {
    const attributes = entity.attributes ?? {};
    const wantsChemistry = !attributes.smiles || !attributes.casNumber || !attributes.formula || !attributes.molecularWeight;
    // A liquid the density table knows, still without a density: one local fill, no network.
    const wantsDensity = !attributes.density && densityFor({ casNumber: attributes.casNumber, label: entity.label }) !== null;
    const wantsHazards = AUTO_CLASSIFY_GHS && Boolean(attributes.pubchemCid) && attributes.ghs === undefined && hazardsDue(attributes);
    if (entity.type === 'compound' && !wantsChemistry && !wantsDensity && !wantsHazards) {
      return false;
    }
    if (force) {
      return true;
    }

    const previous = attributes.autoClassify;
    if (!previous) {
      return true;
    }
    if (Number(previous.attempts ?? 0) >= MAX_ATTEMPTS) {
      return false;
    }
    // A miss is usually permanent (the name is not a substance), so retry rarely.
    return now - Date.parse(previous.at ?? 0) > RETRY_AFTER_MS;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One pass over everything pending. Network failures stop the pass rather than burning attempts
 * on entities that were never actually looked up.
 */
export async function runClassificationPass({ force = false, id = null, limit = BATCH, deps = {} } = {}) {
  const pending = await pendingEntities({ force, id });
  const classified = [];
  let missed = 0;

  for (const entity of pending.slice(0, limit)) {
    let plan;
    try {
      plan = await planClassification(entity, deps);
    } catch (error) {
      return { classified, missed, pending: pending.length, stopped: error instanceof Error ? error.message : 'lookup failed' };
    }

    if (plan) {
      classified.push(await applyPlan(entity, plan, deps));
    } else {
      missed += 1;
      await recordMiss(entity, 'unknown');
    }

    await sleep(REQUEST_GAP_MS);
  }

  return { classified, missed, pending: pending.length, stopped: null };
}

let timer = null;
let running = false;
let queued = false;

async function pass() {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    const result = await runClassificationPass();
    if (result.classified.length > 0) {
      console.log(`Classified ${result.classified.length} ${result.classified.length === 1 ? 'entity' : 'entities'}`);
    }
  } catch (error) {
    console.error('Classification pass failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      setTimeout(pass, REQUEST_GAP_MS).unref();
    }
  }
}

// Writing a `#name` the registry does not know creates a draft; this is what fills it in later.
export function kickClassification() {
  if (AUTO_CLASSIFY) {
    void pass();
  }
}

export function startClassificationWorker() {
  if (!AUTO_CLASSIFY || timer) {
    return;
  }

  timer = setInterval(pass, INTERVAL_MS);
  timer.unref();
  void pass();
}

export function stopClassificationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
