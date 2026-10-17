// The demo notebook: one lab, a synthesis project and a microbiology project, written the way
// the app wants to be used — prose with references, amounts, steps and blocks — plus the
// registry behind it (compounds with structures, a batch, reagents, strains, instruments and
// the freezer things are kept in). Loaded with `npm run db:fixtures` or FIXTURES_ON_START=demo;
// everything carries the marker "demo" so it can be removed again.
import { blank, component, daysAgo, doc, h1, h2, h3, ol, p, plate, plateGroup, q, qPlanned, reaction, ref, results, stamp, tasks, ul } from './builders.mjs';

export const FIXTURE_NAME = 'demo';

const entity = (key, type, label, attributes = {}, extra = {}) => ({ id: `entity-demo-${key}`, type, label, attributes: { ...attributes, fixture: FIXTURE_NAME }, aliases: [], ...extra });

export function demoFixtures() {
  const user = { id: 'user-demo-researcher', displayName: 'Demo Researcher', email: 'demo.researcher@demo.labnotes', initials: 'DR' };

  // ---- registry ------------------------------------------------------------------------
  const E = {
    benzoicAcid: entity('benzoic-acid', 'compound', 'Benzoic acid', { smiles: 'OC(=O)c1ccccc1', formula: 'C7H6O2', molecularWeight: 122.123, casNumber: '65-85-0', meltingPoint: '122 °C' }, { aliases: ['benzenecarboxylic acid'] }),
    methanol: entity('methanol', 'compound', 'Methanol', { smiles: 'CO', formula: 'CH4O', molecularWeight: 32.042, casNumber: '67-56-1', density: 0.792, solvent: true, boilingPoint: '65 °C' }, { aliases: ['MeOH'] }),
    sulfuricAcid: entity('sulfuric-acid', 'compound', 'Sulfuric acid', { smiles: 'OS(=O)(=O)O', formula: 'H2O4S', molecularWeight: 98.079, casNumber: '7664-93-9', density: 1.84, hazards: 'H314' }, { aliases: ['H2SO4'] }),
    methylBenzoate: entity('methyl-benzoate', 'compound', 'Methyl benzoate', { smiles: 'COC(=O)c1ccccc1', formula: 'C8H8O2', molecularWeight: 136.15, casNumber: '93-58-3', density: 1.094, boilingPoint: '199 °C' }),
    dcm: entity('dcm', 'compound', 'Dichloromethane', { smiles: 'ClCCl', formula: 'CH2Cl2', molecularWeight: 84.93, casNumber: '75-09-2', density: 1.33, solvent: true }, { aliases: ['DCM'] }),
    salicylicAcid: entity('salicylic-acid', 'compound', 'Salicylic acid', { smiles: 'OC(=O)c1ccccc1O', formula: 'C7H6O3', molecularWeight: 138.122, casNumber: '69-72-7', meltingPoint: '159 °C' }),
    aceticAnhydride: entity('acetic-anhydride', 'compound', 'Acetic anhydride', { smiles: 'CC(=O)OC(C)=O', formula: 'C4H6O3', molecularWeight: 102.089, casNumber: '108-24-7', density: 1.08, boilingPoint: '140 °C' }, { aliases: ['Ac2O'] }),
    aspirin: entity('aspirin', 'compound', 'Aspirin', { smiles: 'CC(=O)Oc1ccccc1C(=O)O', formula: 'C9H8O4', molecularWeight: 180.159, casNumber: '50-78-2', meltingPoint: '135 °C' }, { aliases: ['acetylsalicylic acid'] }),
    bicarb: entity('bicarb', 'reagent', 'Sat. NaHCO3', { vendor: 'in-house', concentration: 'sat.', storage: 'RT, bench' }),
    brine: entity('brine', 'reagent', 'Brine', { vendor: 'in-house', storage: 'RT, bench' }),
    lb: entity('lb', 'reagent', 'LB medium', { vendor: 'Carl Roth', catalogNumber: 'X964.1', lotNumber: '042337', storage: 'RT, autoclaved', amount: '2 L', expiry: daysAgo(-120) }),
    kan: entity('kan', 'reagent', 'Kanamycin stock', { vendor: 'Sigma', catalogNumber: 'K1876', lotNumber: 'SLCK4411', concentration: '50 mg/mL', amount: '10 mL', storage: '-20 °C, aliquots', expiry: daysAgo(-40) }),
    bl21: entity('bl21', 'sample', 'E. coli BL21(DE3)', { organism: 'Escherichia coli', source: 'lab stock, glycerol box 2', storage: '-80 °C, box 2 / A4' }),
    pet28: entity('pet28', 'sample', 'BL21(DE3) pET-28a', { organism: 'Escherichia coli', condition: 'pET-28a(+) empty vector, KanR', storage: '-80 °C, box 2 / A7' }),
    reader: entity('reader', 'instrument', 'Plate reader', { manufacturer: 'Tecan', model: 'Spark 10M', location: 'Room 214', lastCalibration: daysAgo(130), nextCalibration: daysAgo(-235) }),
    shaker: entity('shaker', 'instrument', 'Shaking incubator', { manufacturer: 'Eppendorf', model: 'Innova 42', location: 'Room 214' }),
    rotavap: entity('rotavap', 'instrument', 'Rotavap', { manufacturer: 'Büchi', model: 'R-300', location: 'Room 212, fume hood 2' }),
    room: entity('room', 'location', 'Room 214', { building: 'Biology building', room: '214' }),
    freezer: entity('freezer', 'container', 'Freezer F2', { kind: 'freezer', temperature: '-20 °C', position: 'Room 214, left wall', barcode: 'CT-FRZR02' }),
    box3: entity('box3', 'container', 'Box 3', { kind: 'cryo box 9×9', position: 'Freezer F2, shelf 2', barcode: 'CT-BOX003' }),
    plate96: entity('plate96', 'container', '96-well flat-bottom plate', { kind: 'microplate, clear, TC-treated (Greiner 655180)', position: 'plate reader, drawer 1' }),
    flask1: entity('flask1', 'container', 'Flask 1', { kind: 'Erlenmeyer flask 250 mL', barcode: 'CT-FLSK01' }),
    tube14: entity('tube14', 'container', 'Tube 14', { kind: 'cryotube 2 mL', barcode: 'CT-TUBE14' }),
    tube15: entity('tube15', 'container', 'Tube 15', { kind: 'cryotube 2 mL', barcode: 'CT-TUBE15' })
  };

  // ---- documents -----------------------------------------------------------------------
  const group = { id: 'group-demo-lab', kind: 'group', title: 'Demo lab' };
  const synthesis = { id: 'project-demo-synthesis', kind: 'project', parentId: group.id, title: 'Synthesis' };
  const micro = { id: 'project-demo-microbiology', kind: 'project', parentId: group.id, title: 'Microbiology' };

  const fischerDate = daysAgo(14);
  const fischer = {
    id: 'experiment-demo-fischer',
    kind: 'experiment',
    parentId: synthesis.id,
    title: 'Fischer esterification of benzoic acid',
    metadata: { status: 'done', date: fischerDate, tags: ['synthesis', 'esterification'] },
    content: doc(
      h1('Fischer esterification of benzoic acid'),
      p('Methyl benzoate from ', ref(E.benzoicAcid), ' and ', ref(E.methanol), ' with catalytic ', ref(E.sulfuricAcid), ', as a test of the workup.'),
      h2('Procedure'),
      ol(
        [stamp(fischerDate, '09:15'), ' Dissolved ', q(1.22, 'g'), ' (10.0 mmol) of ', ref(E.benzoicAcid), ' in ', q(20, 'mL'), ' of ', ref(E.methanol), ' in a 50 mL round-bottom flask.'],
        [stamp(fischerDate, '09:20'), ' Added ', q(0.5, 'mL'), ' of ', ref(E.sulfuricAcid), ' dropwise and heated to reflux at ', q(65, '°C'), ' for ', q(2, 'h'), '.'],
        [stamp(fischerDate, '11:30'), ' Cooled to rt, removed most of the methanol on the ', ref(E.rotavap), ', took the residue up in ', q(30, 'mL'), ' of ', ref(E.dcm), '.'],
        [stamp(fischerDate, '11:50'), ' Washed with ', q(20, 'mL'), ' of ', ref(E.bicarb), ' and ', q(20, 'mL'), ' of ', ref(E.brine), ', dried over MgSO4 and concentrated.']
      ),
      reaction({
        title: 'Esterification',
        components: [
          component('reactant', E.benzoicAcid, { mass: { value: 1.22, unit: 'g' }, amount: { value: 10, unit: 'mmol' }, limiting: true }),
          component('solvent', E.methanol, { volume: { value: 20, unit: 'mL' } }),
          component('catalyst', E.sulfuricAcid, { volume: { value: 0.5, unit: 'mL' } }),
          component('product', E.methylBenzoate, { actualMass: { value: 1.15, unit: 'g' } })
        ],
        conditions: { temperature: { value: 65, unit: '°C' }, temperatureLabel: 'reflux', time: { value: 2, unit: 'h' }, notes: ['dropwise'] },
        collapsed: true
      }),
      h2('Result'),
      p('Workup gave ', q(1.15, 'g'), ' of ', ref(E.methylBenzoate), ' (85 % yield) as a colourless oil. Purity of ', ref(E.methylBenzoate), ' by GC was 97 %.'),
      p('Stored the product in ', ref(E.box3), ' as batch DR-001-A.'),
      h2('Next'),
      tasks([true, 'Register the batch and attach the GC trace.'], [false, 'Try the same with ', ref(E.salicylicAcid), ' (see the aspirin entry).'])
    )
  };

  const aspirinDate = daysAgo(0);
  const aspirin = {
    id: 'experiment-demo-aspirin',
    kind: 'experiment',
    parentId: synthesis.id,
    title: 'Aspirin from salicylic acid',
    metadata: { status: 'in_progress', date: aspirinDate, tags: ['synthesis', 'template-run'] },
    // Started from the "Demo · Acetylation" template: amounts carry the plan, one blank is left.
    content: doc(
      h1('Aspirin from salicylic acid'),
      p('Acetylation of ', ref(E.salicylicAcid), ' with ', ref(E.aceticAnhydride), ', started from the acetylation template. The weighed amount came out a little high; the plan is kept on the tokens.'),
      h2('Procedure'),
      ol(
        [stamp(aspirinDate, '10:05'), ' Weighed ', qPlanned(2.0, 2.07, 'g'), ' of ', ref(E.salicylicAcid), ' into a 100 mL flask.'],
        [stamp(aspirinDate, '10:08'), ' Added ', qPlanned(5, 5, 'mL'), ' of ', ref(E.aceticAnhydride), ' and ', qPlanned(5, 8, 'drops'), ' of ', ref(E.sulfuricAcid), '.'],
        [stamp(aspirinDate, '10:10'), ' Heated at ', qPlanned(60, 60, '°C'), ' for ', qPlanned(15, 20, 'min'), ' with occasional swirling.'],
        ['Cooled on ice, added ', qPlanned(50, 50, 'mL'), ' of water, filtered the solid and washed with ', blank('workup solvent'), '.']
      ),
      reaction({
        title: 'Acetylation',
        components: [
          component('reactant', E.salicylicAcid, { mass: { value: 2.07, unit: 'g' }, limiting: true }),
          component('reagent', E.aceticAnhydride, { volume: { value: 5, unit: 'mL' } }),
          component('catalyst', E.sulfuricAcid, {}),
          component('product', E.aspirin, {})
        ],
        conditions: { temperature: { value: 60, unit: '°C' }, time: { value: 20, unit: 'min' } },
        collapsed: false
      }),
      h2('Observations'),
      p('White solid after filtration; mp of ', ref(E.aspirin), ' was 134 °C (lit. 135 °C). Mass after drying to follow.'),
      h2('Next'),
      tasks([false, 'Dry to constant weight and record the yield.'], [false, 'Recrystallise from ethanol/water.'])
    )
  };

  // Microbiology: a 96-well MIC plate with reader values, prose results, storage and transfers.
  const micDate = daysAgo(7);
  const kanSeries = [0, 1, 2, 4, 8, 16, 32, 64];
  const odP = [1.21, 1.19, 1.18, 1.16, 1.12, 1.05, 0.93, 0.71];
  const odW = [1.24, 0.98, 0.41, 0.07, 0.02, 0.01, 0.01, 0.01];
  const wells = {};
  let seed = 7;
  const noise = (scale) => {
    seed = (seed * 9301 + 49297) % 233280;
    return (seed / 233280 - 0.5) * scale;
  };
  kanSeries.forEach((kan, col) => {
    const note = `kan ${kan} µg/mL`;
    for (const row of ['A', 'B', 'C']) {
      wells[`${row}${col + 1}`] = { group: 'pet28', note, value: Number((odP[col] + 0.04 + noise(0.04)).toFixed(3)) };
    }
    for (const row of ['D', 'E', 'F']) {
      wells[`${row}${col + 1}`] = { group: 'wt', note, value: Number((odW[col] + 0.04 + (odW[col] > 0.05 ? noise(0.04) : noise(0.01))).toFixed(3)) };
    }
    wells[`G${col + 1}`] = { group: 'blank', note, value: Number((0.04 + noise(0.01)).toFixed(3)) };
  });
  const mic = {
    id: 'experiment-demo-mic',
    kind: 'experiment',
    parentId: micro.id,
    title: 'Kanamycin MIC of BL21(DE3) with and without pET-28a',
    metadata: { status: 'done', date: micDate, tags: ['microbiology', 'mic', 'kanamycin', 'plate'] },
    content: doc(
      h1('Kanamycin MIC of BL21(DE3) with and without pET-28a'),
      p('Does the empty ', ref(E.pet28), ' vector give full kanamycin resistance, and what is the MIC of the parent ', ref(E.bl21), ' strain? Twofold dilution series in a ', ref(E.plate96), ', OD600 read in the ', ref(E.reader), ' every 30 min for ', q(6, 'h'), ' at ', q(37, '°C'), '.'),
      h2('Overnight cultures'),
      p('Yesterday 17:30: one colony each of ', ref(E.bl21), ' and ', ref(E.pet28), ' into ', q(5, 'mL'), ' ', ref(E.lb), ' (the plasmid strain with ', q(50, 'µg/mL'), ' kanamycin from the ', ref(E.kan), '), ', q(37, '°C'), ', ', q(200, 'rpm'), ' in the ', ref(E.shaker), '.'),
      h2('Plate setup'),
      ol(
        [stamp(micDate, '08:40'), ' Both overnights at OD600 2.8 (P) and 3.1 (W). Diluted to OD600 0.05 in fresh ', ref(E.lb), ': ', q(180, 'µL'), ' culture into ', q(10, 'mL'), ' medium each.'],
        [stamp(micDate, '08:55'), ' Kanamycin working stock: ', q(2.56, 'µL'), ' of ', ref(E.kan), ' (', q(50, 'mg/mL'), ') in ', q(1, 'mL'), ' LB = ', q(128, 'µg/mL'), '. Twofold series 128 → 2 µg/mL in LB, ', q(100, 'µL'), ' per step.'],
        [stamp(micDate, '09:10'), ' ', q(100, 'µL'), ' of each antibiotic dilution into columns 2–8 of the ', ref(E.plate96), ', column 1 LB only. Then ', q(100, 'µL'), ' diluted culture on top. Row G: LB + antibiotic, no cells.'],
        [stamp(micDate, '09:20'), ' Plate sealed with a breathable membrane, into the ', ref(E.reader), ': ', q(37, '°C'), ', orbital shaking 2 mm, OD600 every ', q(30, 'min'), ' for ', q(6, 'h'), '.']
      ),
      p('Took ', q(180, 'µL'), ' of ', ref(E.pet28), ' into ', ref(E.flask1), ' for the dilution. Stored the ', ref(E.kan), ' back in ', ref(E.freezer), ' afterwards.'),
      h3('Plate layout'),
      p('Columns 1–8 carry 0, 1, 2, 4, 8, 16, 32 and 64 µg/mL kanamycin (see the well notes). Rows A–C: plasmid strain, D–F: parent strain, G: medium and antibiotic only.'),
      plate({
        title: 'Kanamycin series, 6 h',
        format: 96,
        measure: 'OD600',
        groups: [plateGroup('pet28', 'BL21(DE3) pET-28a', '#60a5fa', E.pet28), plateGroup('wt', 'E. coli BL21(DE3)', '#f59e0b', E.bl21), plateGroup('blank', 'LB + kanamycin, no cells', '#94a3b8')],
        wells
      }),
      h2('Results'),
      p(stamp(micDate, '15:25'), ' Run finished. Raw OD600 after ', q(6, 'h'), ' pasted from the reader export into the plate above; row G is the blank at about 0.04.'),
      p('The plasmid strain grows at every concentration up to ', q(64, 'µg/mL'), ' with a slow decline above ', q(16, 'µg/mL'), '. The parent strain is already halved at ', q(2, 'µg/mL'), ' and shows no growth from ', q(4, 'µg/mL'), ' on.'),
      p('At 64 µg/mL the OD600 of ', ref(E.pet28), ' was 0.75, the OD600 of ', ref(E.bl21), ' was 0.05. The MIC of ', ref(E.bl21), ' is 4 µg/mL. Selection at the usual ', q(50, 'µg/mL'), ' is therefore safe for transformants.'),
      h2('Next'),
      tasks([false, 'Repeat with the expression plasmid to see whether the insert changes the curve.'], [true, 'Return the ', ref(E.kan), ' aliquot to ', q(-20, '°C'), '.'])
    )
  };

  const growthDate = daysAgo(3);
  const growth = {
    id: 'experiment-demo-growth',
    kind: 'experiment',
    parentId: micro.id,
    title: 'Growth curve of BL21(DE3) pET-28a in LB',
    metadata: { status: 'done', date: growthDate, tags: ['microbiology', 'growth-curve'] },
    content: doc(
      h1('Growth curve of BL21(DE3) pET-28a in LB'),
      p('Doubling time of ', ref(E.pet28), ' in ', ref(E.lb), ' at ', q(37, '°C'), ' with ', q(50, 'µg/mL'), ' kanamycin, parent ', ref(E.bl21), ' without antibiotic alongside. Shake flasks, OD600 by hand every hour.'),
      h2('Steps'),
      ol(
        [stamp(growthDate, '08:30'), ' Inoculated ', q(50, 'mL'), ' of ', ref(E.lb), ' from the overnight of ', ref(E.pet28), ' into ', ref(E.flask1), ' to OD600 0.05; same for ', ref(E.bl21), ' in a second flask.'],
        [stamp(growthDate, '08:35'), ' Both flasks into the ', ref(E.shaker), ' at ', q(37, '°C'), ', ', q(200, 'rpm'), '.'],
        [stamp(growthDate, '14:40'), ' Aliquoted the ', ref(E.pet28), ' culture into ', ref(E.tube14), ' and ', ref(E.tube15), ' with 15 % glycerol.'],
        [stamp(growthDate, '14:45'), ' Stored ', ref(E.tube14), ' and ', ref(E.tube15), ' in ', ref(E.box3), '.']
      ),
      h2('Readings'),
      results({
        title: 'OD600 by hour',
        columns: [['OD600 1 h'], ['OD600 2 h'], ['OD600 3 h'], ['OD600 4 h'], ['OD600 5 h'], ['OD600 6 h']],
        rows: [
          [E.pet28, [0.09, 0.17, 0.33, 0.64, 1.1, 1.6], 'kan 50 µg/mL'],
          [E.bl21, [0.1, 0.2, 0.41, 0.8, 1.3, 1.7], 'no antibiotic'],
          ['LB blank', [0.04, 0.04, 0.04, 0.05, 0.04, 0.04], '']
        ]
      }),
      p('Doubling time of ', ref(E.pet28), ' was 32 min between 2 h and 4 h; the doubling time of ', ref(E.bl21), ' was 29 min. The plasmid costs about 10 %.'),
      h2('Next'),
      tasks([false, 'Induce with IPTG at OD600 0.6 next time and follow the curve after induction.'])
    )
  };

  // A template with blanks: the acetylation the aspirin entry was started from.
  const template = {
    id: 'template-demo-acetylation',
    name: 'Demo · Acetylation',
    kind: 'experiment',
    content: doc(
      h1('Acetylation of '),
      p('Acetylation of ', blank('substrate'), ' with ', ref(E.aceticAnhydride), ' and catalytic ', ref(E.sulfuricAcid), '.'),
      h2('Procedure'),
      ol(
        ['Weighed ', q(2.0, 'g'), ' of ', blank('substrate'), ' into a 100 mL flask.'],
        ['Added ', q(5, 'mL'), ' of ', ref(E.aceticAnhydride), ' and ', q(5, 'drops'), ' of ', ref(E.sulfuricAcid), '.'],
        ['Heated at ', q(60, '°C'), ' for ', q(15, 'min'), ' with occasional swirling.'],
        ['Cooled on ice, added ', q(50, 'mL'), ' of water, filtered the solid and washed with ', blank('workup solvent'), '.']
      ),
      h2('Observations'),
      p('Appearance: ', blank('appearance'), '. mp of ', blank('product'), ' was ', blank('mp'), '.'),
      h2('Next'),
      tasks([false, 'Dry to constant weight and record the yield.'])
    )
  };

  // The batch registered from the esterification, as the reaction block would make it.
  const batch = entity('mb-batch', 'batch', 'DR-001-A', { batchCode: 'DR-001-A', amount: '1.15 g', appearance: 'colourless oil', purity: 97, purityMethod: 'GC', madeInDocumentId: fischer.id, madeBy: user.id, barcode: 'BT-DR001A' });

  // Hand-made relations: the places, and the batch's compound.
  const relations = [
    { subject: E.freezer, predicate: 'stored_in', object: E.room },
    { subject: E.box3, predicate: 'stored_in', object: E.freezer },
    { subject: batch, predicate: 'belongs_to', object: E.methylBenzoate, sourceDocumentId: fischer.id },
    { subject: batch, predicate: 'stored_in', object: E.box3 }
  ];

  return {
    name: FIXTURE_NAME,
    users: [user],
    entities: [...Object.values(E), batch],
    relations,
    documents: [group, synthesis, micro, fischer, aspirin, mic, growth],
    templates: [template]
  };
}
