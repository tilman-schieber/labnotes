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
- The popup gets out of the way on its own when the text stops looking like a name (sentence punctuation, or more than four words with no match).
- If nothing matches, the last row is **Create "…"**. Accepting it creates a *draft* entity of type `unclassified` and inserts the reference. Drafts are classified later in the registry — see [Drafts](entities.md#drafts); writing never waits.

Hovering a reference shows a card: type, structure for compounds, stock left, expiry, and how many documents reference it. Clicking a compound reference toggles an inline structure drawing.

<!-- screenshot: the # picker with a "used in this project" row and a Create row -->

## People with `@`

`@` works like `#` but searches users (name or e-mail). Users come from the seed or the API; see [Data](data.md#users).

## Quantities

A number followed by a unit becomes a **quantity token** when you type the space after it: `25 mg`, `2.5 mL`, `12,5 mL` (decimal comma is fine), `-20 °C`, `2 eq`, `10 min`.

Units understood: g, L, mol, M with SI prefixes (n, µ/u, m, c, k; `ml` and `ul` spellings accepted), °C (also `C`, `degC`), K, s/min/h/d, eq/equiv, %.

- **Unit popup.** After you type a number and a space (or the first letters of a unit), a small list offers units — the ones already used in this document first, nearest to the caret, then the everyday set. Tab or Enter inserts the token; keep typing to ignore it; Escape dismisses it for that number.
- **Editing.** Double-click a token, or select it with the arrow keys and press Enter. Typing something that is not a quantity turns it back into plain text.
- **Hover** shows the same amount in other units of that dimension.
- **Backspace** right after the space undoes the conversion, like any input rule.

Quantities are more than formatting: the sentence they sit in binds them to the reference next to them. `Add 25 mg of #Compound X` makes 25 mg a *usage* of Compound X. See [Usages](entities.md#usages).

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

A top-level paragraph that starts with an instruction — *Add, Stir, Incubate, Centrifuge, Wash, Dry, Heat, Cool, Transfer, Wait, …* — is a **protocol step**. It gets a number in the left margin and appears in the **Steps** panel below the editor together with the duration and temperature read from its quantities and any timestamps in it. Clicking a step in the panel moves the caret there.

Lists number themselves, so paragraphs inside lists are not counted. Narrative sentences ("The mixture was stirred overnight") are not steps.

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

## Metadata: status, date, tags

Experiments carry a status (planned, in progress, done, failed, abandoned), a date, and tags, edited in the strip above the editor. The date orders chapters in the [project book](export.md#project-and-group-books) and the entity timeline; tags are searchable.

## Templates

**Template** in the document header saves the current experiment's content as a template. The **+** menu lists templates under "From template"; creating from one copies its content with a fresh title. Templates are content only — no metadata, no history.

## Search

The search box in the header searches titles, text and tags of every document and shows snippets with the matches marked. A query that is only `#tag` (no spaces) lists the documents carrying that tag instead. Results open the document.

## Saving

Everything saves automatically shortly after you stop typing; the indicator in the header shows Saved / Saving… / Save failed. Each save also re-derives references, usages and search text, and records a revision (see [Revisions](history.md)).
