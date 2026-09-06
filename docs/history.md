# Revisions, signatures & sharing

## Revisions

Every save records the document's title and content as a **revision**. To keep history readable, saves within two minutes of the latest revision's start are folded into it (configurable with `REVISION_COALESCE_SECONDS`), so a revision is a writing session rather than a keystroke.

**History** in the document header lists revisions newest first with their time and title. **Restore** writes an old snapshot back as the current content — and records that as a new revision, so nothing is ever lost. Merging entities also rewrites documents through revisions.

Revisions store content only. Attachments and metadata (status, date, tags) are not versioned.

## Signing

A revision can be **signed** by a user (chosen in the "Sign as" selector; users come from the seed or the [API](data.md#users)), with an optional note. Signing freezes it:

- later saves never coalesce into a signed revision — they always start a new one;
- the signature (who, when, note) shows in History and in the PDF header;
- only signed revisions can be shared.

## The hash chain

Signing also records two hashes:

- **content hash** — SHA-256 of the canonical JSON of title and content (key order normalised, so it is identical on Postgres and SQLite);
- **chain hash** — SHA-256 over the previously signed revision's chain hash (in signing order, per document), this content hash, the signer, the signing time and the note.

Because each link includes the one before it, changing anything behind a signature — content, signer, time, note, or the order of signatures — breaks every later link.

**Verify** in History recomputes the whole chain and marks each signed revision *verified* or *tampered* with the reason (content differs, link broken, signature record altered). The chain head (first 12 characters) is shown next to the verdict, on each signed revision, and printed in the PDF header, so a printed copy can be checked against the database later.

This is tamper *evidence*, not access control: someone with database access can rewrite everything consistently. It catches accidental and casual edits and gives a printed anchor; a signature server or external timestamping would be the next step.

## Share links

**Share** on a signed revision creates a read-only link, `/share/<token>`, and shows it in a dialog. The token is random and unguessable; asking again for the same revision returns the same link.

The share page is standalone — no app, no navigation, no editing — and shows the title, its place in the notebook, the signature facts, the chain hash, and the frozen snapshot as an embedded PDF. `/share/<token>.pdf` and `/share/<token>.typ` give the PDF and the Typst source of that revision (not the current content).

Links are revoked with `DELETE /api/share/<token>`; a revoked or unknown link answers 404. Deleting the document removes its links.

<!-- screenshot: History with a verified chain and a Share button -->
