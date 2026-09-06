# Chemistry & reactions

Chemistry lives on **compound** entities in the registry and in **reaction tables** in the text. Both are optional: a biology notebook never needs to open them.

## Compounds

A compound is an entity of type `compound`. Its chemistry is kept in attributes and edited in the compound panel of the registry:

- **SMILES** — entered by hand, drawn in the structure editor (Ketcher), or fetched from PubChem by name or CAS number. It is validated on entry.
- **Derived properties** — formula, molecular weight, exact mass, cLogP, TPSA, H-bond donors/acceptors — are computed from the SMILES (OpenChemLib) and stored with it.
- **Identifiers** — CAS number, IUPAC name, PubChem CID when known. Registry search matches CAS, SMILES and the canonical structure exactly.
- **Duplicates** — the canonical IDCode of the structure is compared across the registry; a compound with the same structure is offered for a one-click merge.

Compound references in the text show the structure on hover and can display it inline (click the token). PDFs draw the structure next to the reference and on the structure pages of a book.

Attributes such as density, melting and boiling point and hazards are plain typed fields; density is used by reaction tables.

<!-- screenshot: the compound panel with structure, properties and the PubChem lookup -->

## Reaction tables

A reaction table is a block in the text that computes stoichiometry. Insert it with `/reaction` or the toolbar flask.

### Where the rows come from

The table reads the **section above it** — everything since the previous heading — and creates one row per entity referenced there, with the amounts bound to it:

> Dissolve 2 g of #Salicylic acid in 5 mL of #Acetic anhydride and add 2 drops of #H2SO4. Heat to 80 °C for 30 min. The mixture gave 2.1 g of #Aspirin as white needles.

produces rows for salicylic acid (mass 2 g), acetic anhydride (volume 5 mL), H2SO4, and aspirin as the product with an isolated mass of 2.1 g. Roles are read from the sentence: *dissolved in / in / washed with …* makes a solvent, *gave / afforded / yielded / obtained / product* makes a product, amounts given only as equivalents make a reagent, anything else with an amount is a reactant.

Rows created this way carry a small **¶ from text** marker; hover it to see the sentence.

**↻ from text** re-reads the section and adds rows for new entities and fills empty cells — it never overwrites what you typed in the table.

### What the table computes

| Column | Meaning |
| --- | --- |
| Role | reactant, reagent, solvent, product |
| Compound | free text, or a registry compound (picker); linking pulls the MW |
| MW | g/mol, editable |
| Equiv | entered, or computed relative to the limiting reagent |
| mmol | from mass and MW; or volume and concentration; or volume, density and MW |
| Mass | entered; for rows with only equivalents the mass *needed* is shown; for products the *theoretical* mass |
| Volume, Conc. / density | for liquids and solutions |
| Yield | products: isolated mass and the percentage of theoretical |

The **limiting reagent** is the first reactant with a computable amount, or the one you mark with "lim.". Equivalents, needed masses, theoretical mass and yield are all relative to it.

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
- a table where no reactant has a computable amount at all.

These are warnings, not errors; the table still renders and exports.

<!-- screenshot: a reaction table with a ¶ marker and a yield warning -->

## Usage roles and totals

The same sentence reading that fills reaction tables records **usages** on every save: entity × amounts × role. They show up as amounts on the Linked entities chips, as a timeline and totals on the entity in the registry, and as stock consumption. See [Entities](entities.md#usages).
