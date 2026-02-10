# Lab Notebook Prototype

Minimal single-page lab notebook built with Vite, React, TypeScript, and TipTap.

## Stack

- Vite
- React + TypeScript
- TipTap (`StarterKit`, `Table`, `Mention`)
- `localStorage` persistence

## MVP Features

- Rich text editing:
  - Paragraphs, headings, bold, italic, bullet lists
  - Fixed document structure: first block is always editable `h1`
- Markdown-style shortcuts:
  - `*italic*`, `_italic_`, `**bold**`, `__bold__`
  - `#` to `######` headings
  - `- ` / `+ ` / `* ` for bullet lists
  - `$...$` inline math and `$$...$$` block math
- Basic tables (insert and edit)
- `@mentions` with static options:
  - `Sample A`
  - `Sample B`
  - `Compound X`
- Sidebar tree structure:
  - Groups -> Projects -> Protocols
- Create actions:
  - New Group
  - New Project (inside selected group)
  - New Protocol (inside selected project)
- Autosave and restore from `localStorage`
- Last active protocol restored on reload

## Data Model

All app data is stored in a single `localStorage` key:

- Key: `lab-notebook-db`

Shape:

```ts
{
  groups: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; groupId: string; name: string }>;
  protocols: Array<{
    id: string;
    groupId: string;
    projectId: string;
    title: string;
    content: JSONContent; // TipTap document JSON
  }>;
  active: {
    groupId: string | null;
    projectId: string | null;
    protocolId: string | null;
  };
}
```

## First-Run Seed

On first run, the app seeds:

- `Default Group`
  - `General`
    - `Untitled Protocol`

## Project Structure

```text
src/
  App.tsx                          # App shell, sidebar tree, create actions, toolbar
  index.css                        # Layout and editor/sidebar styles
  storage/
    documentStore.ts               # DB load/save + seed + normalization
  editor/
    Editor.tsx                     # TipTap setup and editor rendering
    ReactionBlock.ts               # placeholder
    SpreadsheetBlock.ts            # placeholder
    EntityReference.ts             # placeholder
    extensions/
      Mention.ts                   # static @mention extension
      MarkdownShortcuts.ts         # markdown input rules
```

## Run Locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Notes and Non-Goals (Current)

- No backend
- No authentication
- No collaboration
- No protocol rename/delete yet
- No drag/drop tree reordering
- Math rendering uses MathJax from CDN at runtime (with `mhchem` for `\ce{...}`)
