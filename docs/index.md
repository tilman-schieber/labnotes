# Labnotes

Labnotes is a lab notebook you *type into*. The core experience is writing a protocol as prose — what you did, with what, how much, when. Everything else (the registry of samples and reagents, stoichiometry tables, signatures, PDF export) is derived from that text or sits one keystroke away from it.

These pages are the reference. Start with [Writing a protocol](writing.md) if you are new; the [Glossary](glossary.md) explains every term used in the app.

## The mental model

**Notebook tree.** Documents are nested three levels deep and never deeper:

- **Group** — a lab, team or topic. Groups sit at the top.
- **Project** — a line of work inside a group.
- **Experiment** — one notebook entry (a *Laborprotokoll*): the thing you actually write. Experiments live inside projects.

Each level is a document with its own text, so a project page can hold aims and background while its experiments hold the day-to-day.

**Tokens in the text.** As you type, some things become *tokens* — small inline chips that carry meaning beyond their letters:

| Token | Looks like | How it appears |
| --- | --- | --- |
| Entity reference | `#Lysis Buffer` | type `#`, pick or create |
| Person | `@Researcher` | type `@`, pick |
| Quantity | `25 mg` | type a number and a unit, then a space |
| Timestamp | `14:32` | `/time` or Ctrl/Cmd+Shift+T |

Tokens are what make the notebook more than text: references are indexed, amounts are summed, timestamps are ordered.

**The registry.** Every `#` reference points at an *entity* — a sample, reagent, compound, instrument, container or location. Entities live in the registry (the "Entities" view) with attributes, aliases, relations and a record of where and how much they were used. A name the registry does not know yet becomes a *draft* the moment you reference it, so writing never waits for data entry.

**Derived, not entered.** Usages (which entity, how much, in what role), reaction tables, protocol steps, search text and the entity index in PDF exports are all read from the prose. When the text changes, they follow.

## A first protocol

1. Create a group and a project with **+** in the sidebar, then an experiment.
2. The first line is the title. Below it, just write:

   > Add 25 mg of #Compound X to 2 mL of #Lysis Buffer and stir for 10 min at 60 °C.

   Typing `#Comp` opens a picker; Tab accepts the top match. `25 mg` became a quantity token when you typed the space after it.
3. Look at the footer: **Linked entities** lists Compound X (25 mg) and Lysis Buffer (2 mL); **Steps** lists step 1 with "10 min · 60 °C".
4. Type `/reaction` on an empty line: a stoichiometry table pre-filled from the sentence above appears.
5. Open **History**, sign the revision, and **Share** it — the link shows a frozen, read-only PDF.

<!-- screenshot: the editor after step 3, with the footer panels visible -->

## Pages

- [Writing a protocol](writing.md) — the editor, references, quantities, steps, templates, search
- [Chemistry & reactions](chemistry.md) — compounds, structures, reaction tables and their checks
- [Entities & registry](entities.md) — types, attributes, aliases, relations, merging, stock, drafts
- [Revisions, signatures & sharing](history.md) — history, restore, signing, the hash chain, share links
- [PDF export](export.md) — single experiments and project books
- [Data, backends & API](data.md) — Postgres/SQLite, environment, scripts, the HTTP API
- [Keyboard](keyboard.md) — everything reachable without the mouse
- [Glossary](glossary.md)
