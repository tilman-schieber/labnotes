# Chemistry & reactions

Chemistry lives on **compound** entities in the registry and in **reaction tables** in the text. Both are optional: a biology notebook never needs to open them.

## Compounds

A compound is an entity of type `compound`. Its chemistry is kept in attributes and edited in the compound panel of the registry:

- **SMILES** — entered by hand, drawn in the structure editor (Ketcher), or fetched from PubChem by name or CAS number. It is validated on entry.
- **Derived properties** — formula, molecular weight, exact mass, cLogP, TPSA, H-bond donors/acceptors — are computed from the SMILES (OpenChemLib) and stored with it.
- **Identifiers** — CAS number, IUPAC name, PubChem CID when known. Registry search matches CAS, SMILES and the canonical structure exactly.
- **Duplicates** — the canonical IDCode of the structure is compared across the registry; a compound with the same structure is offered for a one-click merge.

Compound references in the text show the structure on hover and can display it inline (click the token). PDFs draw the structure next to the reference and on the structure pages of a book.

Attributes such as density, melting and boiling point are typed fields; density is used by reaction tables (and filled from a built-in table of common liquids, see below). **Hazards**: the GHS classification PubChem lists — signal word, pictograms, H-statements — is fetched by the [classifier](entities.md#filling-entities-in-automatically) and shown on the compound page, on hover cards, as a badge in reaction rows, and under the table in the PDF. The free-text *Hazards* field stays for your own notes; the supplier's SDS remains the reference.

<!-- screenshot: the compound panel with structure, properties and the PubChem lookup -->

## Reaction tables

A reaction table is a block in the text that computes stoichiometry. Insert it with `/reaction` or the toolbar flask.

### Where the rows come from

The table reads the **section above it** — everything since the previous heading — and creates one row per entity referenced there, with the amounts bound to it:

> Dissolve 2 g of #Salicylic acid in 5 mL of #Acetic anhydride and add 2 drops of #H2SO4. Heat to 80 °C for 30 min. The mixture gave 2.1 g of #Aspirin as white needles.

produces rows for salicylic acid (mass 2 g), acetic anhydride (volume 5 mL), H2SO4, and aspirin as the product with an isolated mass of 2.1 g. Roles are read from the sentence: *dissolved in / in / washed with …* makes a solvent, *gave / afforded / yielded / obtained / product* makes a product, *cat. / catalytic / catalysed by* or an amount in mol% makes a catalyst, amounts given only as equivalents make a reagent, anything else with an amount is a reactant. A known solvent (methanol, THF, DCM … — the same table that supplies densities) measured only by volume is a solvent even without "in", and the registry's *Solvent* flag on a compound does the same for rows that were read before the entity was classified. A role you pick by hand is never changed by these rules.

Amounts in bracket notation are read too: `#Benzoic acid (1.22 g, 10.0 mmol, 1.0 equiv)` gives the row a mass, a stated amount and equivalents. When the stated mmol disagrees with mass ÷ MW by more than 2 %, the table says so.

**Conditions** — temperature, time, atmosphere, pressure, stirring speed and a few words such as *dropwise* or *overnight* — are read from the same section (*heated to 80 °C for 4 h under N2*, *refluxed overnight*, *at rt*) and shown as editable chips under the table title. They print in the PDF and over the arrow of the scheme.

### The scheme

Above the table, rows linked to registry compounds with structures are drawn as a **scheme**: reactants → products, the conditions over the arrow, reagents and catalysts under it, solvents left to the conditions. It follows the rows until you **Edit scheme** (Ketcher, in reaction mode: reactants, arrow, products); a drawn scheme is kept as reaction SMILES on the block and **↻ from rows** goes back to following the table. The scheme is printed at the top of the reaction in the PDF.

Rows created this way carry a small **¶ from text** marker; hover it to see the sentence.

**↻ from text** re-reads the section and adds rows for new entities and fills empty cells — it never overwrites what you typed in the table.

**▾ table / ▸ table** in the block header folds the stoichiometry table away once the numbers are settled: the scheme, the conditions and a one-line summary (rows, isolated mass and yield per product, warning count) stay visible. The choice is kept with the document.

### What the table computes

| Column | Meaning |
| --- | --- |
| Role | reactant, reagent, catalyst, solvent, product |
| Compound | free text, or a registry compound (picker); linking pulls the MW, structure and density |
| MW | g/mol, editable |
| Equiv | entered, or computed relative to the limiting reagent |
| mmol | from mass and MW; or volume and concentration; or volume, density and MW; or a stated mmol from the text |
| Mass | entered; for rows with only equivalents the mass *needed* is shown; for products the *theoretical* mass |
| Volume, Conc. / density / purity | for liquids and solutions — see below |
| Yield | products: isolated mass, isolated mmol and the percentage of theoretical |

The **limiting reagent** is the reactant you mark with "lim."; without a mark it is the *weighed* reactant (a mass, a stated mmol, or a molar solution — not a neat liquid poured by volume) with the fewest equivalents relative to its stated stoichiometry (mmol ÷ equiv), which the header notes as *(fewest equiv)*. Equivalents, needed masses, theoretical mass and yield are all relative to it.

### Liquids, solutions and purity

- **Neat liquids**: volume × density ÷ MW. Densities for some sixty common solvents and liquid reagents are built in and filled onto the compound (and from there into the row) by CAS number or name — *MeOH*, *dry THF*, *conc. H2SO4* all resolve. Edit the compound's *Density* if your bottle differs.
- **Molar solutions**: volume × concentration (`2 M`, `0.5 mM`).
- **Mass-per-volume solutions**: `10 mg/mL`, `50 µg/mL`, `ppm` (aqueous, 1 mg/L), `5 w/v%` — volume × concentration gives the mass, MW gives the mmol.
- **Weight-percent solutions**: `37 wt%` needs the row's density (of the solution) or a mass instead of a volume.
- **Purity**: an assay in percent scales the amount derived from a mass or a neat volume (and the isolated mmol of a product). Leave it blank for 100 %.
- **mol%** on a catalyst is equivalents ÷ 100: `5 mol%` is 0.05 equiv.

### Worked example

Salicylic acid 2 g (MW 138.12) → 14.48 mmol, limiting. Acetic anhydride 5 mL, density 1.08, MW 102.09 → 52.9 mmol = 3.65 eq. H2SO4 at 0.05 eq → 0.72 mmol, needs 71 mg. Aspirin (MW 180.16) theoretical 2.61 g; isolated 2.1 g → 80.5 %.

### Text and table stay in sync

Editing a mass, volume or concentration in the table writes the new amount back to the quantity token in the sentence it was read from, when that sentence still carries an amount of the same kind for the same entity. The table is a view of the text, not a second place to enter it. (If there is no bound amount in the text, the table keeps the value on its own.)

### Checks

Below the table, the numbers are sanity-checked and the offending rows are marked:

- a product yield above 100 % — check the isolated mass, the product MW, or which reagent is limiting;
- a product with a theoretical mass but no isolated mass ("no yield");
- a product without MW when a limiting reagent exists;
- a reactant or reagent with a mass but no MW;
- a volume with nothing that turns it into an amount (no concentration, no density + MW);
- a stated mmol that disagrees with the mass and MW by more than 2 %;
- a table where no reactant has a computable amount at all.

These are warnings, not errors; the table still renders and exports.

<!-- screenshot: a reaction table with a ¶ marker and a yield warning -->

## Batches and analytics

Once a product has an isolated mass, **Register batch** on its row turns the material into a [batch](entities.md#batches) — `TS-012-A` — and the row shows the code. **+ analytics** then inserts an **analytics block** under the table for that batch: one line per technique (TLC with Rf and eluent, 1H/13C NMR, MS, HRMS, HPLC, IR, mp, appearance, purity …), each with a free-text observation and any of the experiment's attachments linked as the spectrum or trace. `/analytics` inserts an empty block anywhere; pick the batch in its header.

The block is part of the document: it is signed with the revision and printed in the PDF. On every save the server mirrors it onto the batch entity, so the registry shows a batch's data wherever the batch is later used.

In the next experiment, pick `TS-012-A` in a reactant row (the picker lists batches with compounds); the amount you use comes off the batch's stock, and the batch made from *that* reaction records `TS-012-A` as a precursor.

## Usage roles and totals

The same sentence reading that fills reaction tables records **usages** on every save: entity × amounts × role. They show up as amounts on the Linked entities chips, as a timeline and totals on the entity in the registry, and as stock consumption. See [Entities](entities.md#usages).
