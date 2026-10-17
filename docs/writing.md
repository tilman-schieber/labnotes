# Writing a protocol

The editor is a rich-text page. You can format it like any document, but its point is the handful of things that happen *while you type*: references, quantities, timestamps, recognition, and steps.

## Title and structure

The first line of a document is its title (a level-1 heading); it is also the name shown in the sidebar. Everything after it is free.

Markdown-style shortcuts work at the start of a line:

| Type | Get |
| --- | --- |
| `## ` … `###### ` | heading level 2–6 |
| `- ` or `* ` | bullet list |
| `1. ` | numbered list |
| `[ ] ` | task list |
| `**bold**`, `*italic*`, `__bold__`, `_italic_` | inline marks |

Everything else is in the `/` palette or the toolbar: tables, block quotes, dividers, formulas, reaction tables.

## References with `#`

Type `#` followed by a name. A picker opens as you type — spaces are allowed, so `#Lysis Buffer` works — and ranks:

1. entities recently referenced in the same project ("used in this project"),
2. label prefix matches,
3. everything else by similarity, including aliases, CAS numbers and formulas.

Documents are entities too: `#General` references the project called General, and the token is coloured differently.

- **Tab** or **Enter** accepts the highlighted row; **↑/↓** move; **Escape** leaves what you typed as plain text.
- The popup gets out of the way on its own when the text stops looking like a name: sentence punctuation, more than three words, or a word only a sentence contains (`#toluene was` is prose, so Enter there is a line break, not a draft called "toluene was").
- If nothing matches, the last row is **Create "…"**. Accepting it inserts the reference at once and creates a *draft* entity of type `unclassified` in the background; keep typing, nothing waits for the server. The classifier picks the draft up seconds later, so most drafts are typed and filled in without anyone doing anything — see [Filling entities in automatically](entities.md#filling-entities-in-automatically).
- A reference is followed by one space. Typing another space, or a comma or full stop, right after it does the expected thing: the extra space is dropped and the punctuation sits against the token.

**Click a reference to edit the entity** without leaving the page: a small popover shows the name, the type (a draft offers a row of types to pick from), the attributes that matter for that type — vendor, lot and stock for a reagent, SMILES for a compound (typed, or drawn with **Draw…** in Ketcher), storage for a sample — and a link to the full registry page. Saving updates every token in the text and the registry at once.

A reference always shows the registry's current type, so a token written before its entity was classified turns into a compound (blue) as soon as it is one. Hovering a reference shows a card: type, structure for compounds, stock left, expiry, and how many documents reference it. Clicking a compound reference toggles an inline structure drawing.

<!-- screenshot: the # picker with a "used in this project" row and a Create row -->

## People with `@`

`@` works like `#` but searches users (name or e-mail). Users come from the seed or the API; see [Data](data.md#users).

## Quantities

A number followed by a unit becomes a **quantity token** when you type the space after it: `25 mg`, `2.5 mL`, `12,5 mL` (decimal comma is fine), `-20 °C`, `2 eq`, `10 min`.

Units understood: g, L, mol, M with SI prefixes (n, µ/u, m, c, k; `ml` and `ul` spellings accepted), °C (also `C`, `degC`), K, s/min/h/d, eq/equiv, %.

- **Unit popup.** Once you type the first letter of a unit after a number (`25 m`), a small list offers units — the ones already used in this document first, nearest to the caret, then the everyday set. Tab or Enter inserts the token; keep typing to ignore it; Escape dismisses it for that number. After a bare `25 ` nothing opens (numbers in prose are left alone); press Tab there to ask for the list.
- **Editing.** Double-click a token, or select it with the arrow keys and press Enter. Typing something that is not a quantity turns it back into plain text.
- **Hover** shows the same amount in other units of that dimension.
- **Backspace** right after the space undoes the conversion, like any input rule.

Quantities are more than formatting: the sentence they sit in binds them to the reference next to them. `Add 25 mg of #Compound X` makes 25 mg a *usage* of Compound X. See [Usages](entities.md#usages).

## Results: what came out

A measured value written next to a reference becomes a **result** on that entity, the way an amount becomes a usage:

> The OD600 of #Culture A was 1.21. #Batch 7: purity 98.5 %. The Tm of #Primer F1 is 61.3 °C.

The pattern is *measure* **of** *#entity* **was / is / = / reads** *number* *unit*, or *#entity*: *measure* *number*. Measures are whatever you call them (OD600, pH, Tm, yield, viability, cell count); units are optional. Amounts used (`25 mg of #X`) are not results. Results appear on the entity's registry page under **Results**, newest first, on the hover card as the latest value, and in the PDF index.

For many samples at once, type `/results`: a small table with one row per sample and one column per measure (with a unit). **Paste…** takes a spreadsheet export whose header row names the measures (`Viability (%)` gives the unit) and whose first column names the samples; names that match a reference in the document are linked automatically, others can be picked from the registry. Every number in a linked row is a result. A [plate](plates.md) with a measure records the mean per group that is a registry entity in the same way.

## Recognition: names and amounts you did not tokenise

Plain text that matches a registry name (label or alias, three characters or more) is underlined, and so are amounts written without a token (`25mg` pasted from somewhere, or typed before the unit was known). Nothing changes until you ask:

- click an underline to convert that one;
- **Ctrl/Cmd+.** converts the next one after the caret;
- **Ctrl/Cmd+Shift+L**, the toolbar button "Link … names · … amounts", or `/link` converts all of them.

Recognition skips words inside a `#` or `@` you are still typing, glued single-letter units (`3d`) and hyphenated identifiers (`LB-100 g`). Names are reloaded when you focus the editor after a minute and whenever an entity is created.

## Timestamps

`/time` or **Ctrl/Cmd+Shift+T** inserts the current time as a token (the full date is on hover, and in exports). Use them to mark when a step started; the Steps panel lists them.

`/date` inserts today's date as plain text.

## Steps

Write a procedure as a numbered or bulleted list (`1. ` or `- ` at the start of a line): one item per step, with its amounts, times and temperatures as tokens, and timestamps where you want to record when something happened. Nested items are sub-steps. Task lists (`[ ] `) give each step a checkbox.

**Stamp steps** in the toolbar turns on protocol mode for the document: every new list item you start with Enter begins with the current time, so a procedure written as it happens records when each step began. Enter on an item that holds only its stamp leaves the list, as usual. The setting is remembered per document in this browser.

## The `/` palette

Type `/` at the start of a word:

| Command | Does |
| --- | --- |
| Timestamp, Date | see above |
| Heading, Subheading | level 2 / 3 heading |
| Bullet list, Numbered list, Task list | lists |
| Table | 3 × 3 with a header row |
| Reaction | stoichiometry table, pre-filled from the section above — see [Chemistry](chemistry.md#reaction-tables) |
| Formula | display math block (LaTeX; `\ce{}` chemical equations are supported in exports) |
| Quote, Divider | block quote, horizontal rule |
| Link known names and amounts | converts every underline |
| Keyboard shortcuts | the [Keyboard](keyboard.md) reference |
| Help | opens these pages |

## Formulas

The toolbar **Formula** button wraps the selection (or nothing) in inline math; `/formula` inserts a display block. Both take LaTeX. Chemical equations can be written mhchem-style, `\ce{2H2 + O2 -> 2H2O}`; the PDF export rewrites them into plain LaTeX.

## Images and attachments

Paste or drop an image into the text and it is uploaded as an attachment and inserted. The **Attachments** panel below the editor lists every file attached to the document (any type, up to 50 MB by default), with download, delete, and "insert" for images. Attachments keep their SHA-256 so exports and audits can prove which file was meant.

## Starting an experiment

**Alt+N**, the **New experiment** button on a project page, the **+** menu in the sidebar or the palette (Ctrl/Cmd+K) start today's experiment in the current project: it gets the next number, today's date and the status *in progress*, and opens with its title selected so the first thing you type names it. The empty body shows a one-line hint of what to write.

## Project and group pages

A project page is the notebook's table of contents: below its own text it lists every experiment in the project, newest first, with number, status, date, the first line of the protocol and the entities it references (click one to open it in the registry). A group page lists the same per project.

## Finding things: Ctrl/Cmd+K

The palette jumps anywhere from the keyboard: type part of an experiment title or number, a project, a group or an entity name; Enter opens it. With nothing typed it offers the actions (new experiment, new project, registry, help, PDF) and the latest experiments. The sidebar also keeps a short **Recent** list above the tree.

## Metadata: number, status, date, tags

Experiments carry a status (planned, in progress, done, failed, abandoned), a date, and tags, edited in the strip above the editor. A new experiment starts *in progress* with today's date. The date orders chapters in the [project book](export.md#project-and-group-books) and the entity timeline; tags are searchable.

Every experiment also has a **number**, assigned when it is created: the next free number in its project, never reused, shown in the tree (`012 · Title`) and in the strip (`Exp 012`). Together with the writer's initials it forms the experiment code, `TS-012`, that product [batches](entities.md#batches) are named after (`TS-012-A`).

## Who is writing

There is no login. The select in the sidebar head names the person at the keyboard; the choice is remembered in this browser. It is the default signer in the history panel and supplies the initials for batch codes. Click the initials next to the select to change them (they default to the first letters of the display name).

## Cloning an experiment

**Clone** in the document header starts the next run from the current one: a copy in the same project with a fresh number, status *planned*, today's date and the same tags. The prose, amounts, reaction rows and conditions stay; timestamps, ticked boxes, isolated masses, registered batches and analytics blocks are removed, since they belonged to the run being copied. The clone remembers its origin in its metadata.

## Templates

**Template** in the document header saves the current experiment's content as a template. The **+** menu lists templates under "From template"; creating from one copies its content with a fresh title. Templates are content only — no metadata, no history.

## Search

The search box in the header searches titles, text and tags of every document and shows snippets with the matches marked. A query that is only `#tag` (no spaces) lists the documents carrying that tag instead. Results open the document.

## Saving

Everything saves automatically shortly after you stop typing; the indicator in the header shows Saved / Saving… / Save failed. Each save also re-derives references, usages and search text, and records a revision (see [Revisions](history.md)).
