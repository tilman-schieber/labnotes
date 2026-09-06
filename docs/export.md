# PDF export

Documents export through [Typst](https://typst.app). The `typst` binary must be on the server's PATH (or named in `TYPST_BIN`); the `mitex` package is fetched by Typst on first use for LaTeX formulas.

## A single experiment

**PDF** in the document header renders the current content. `/api/documents/<id>/export.typ` returns the Typst source instead, useful for tweaking a layout by hand.

What is rendered:

| In the text | In the PDF |
| --- | --- |
| headings, lists, task lists, quotes, tables, code, dividers | native Typst |
| `#reference`, `@person`, quantities, timestamps | coloured boxes |
| compound references | the structure drawn next to the reference when it is shown inline |
| reaction tables | role / compound / MW / equiv / mmol / mass / volume / yield, with structures |
| inline and display math | via mitex; `\ce{}` is rewritten to plain LaTeX |
| images | embedded from attachments (PNG, JPEG, GIF, SVG) |

The header line shows the path in the notebook, status / date / tags, and the latest revision — with signer, date and chain prefix when it is signed.

## Project and group books

**PDF book** on a project renders every experiment in it; on a group, every project and its experiments. The book has:

1. a title page with the experiment count and date range;
2. a contents outline;
3. one chapter per experiment in **date order** (the experiment's date field, else creation), with the experiment's own headings shifted one level down. For a group, projects are chapters and experiments sections;
4. an **index of entities**: every entity referenced in the book, its type, and the experiments it was used in with the amounts read from each;
5. **structure pages**: every compound with a known structure, drawn with formula and MW.

## Frozen revisions

Share links export a specific revision, not the current content — see [Sharing](history.md#share-links).

## Typst source

The `.typ` output is plain text you can compile yourself (`typst compile document.typ`) after saving the structure SVGs and attachments next to it; the server does exactly that in a temporary directory.
