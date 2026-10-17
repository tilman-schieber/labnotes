# Plates

A **plate block** records a microplate the way you would sketch it on paper: which wells hold what, and what the reader measured in them. Type `/plate` on an empty line or use **Plate** in the toolbar. The block starts as a 96-well plate; the format (6, 12, 24, 48, 96, 384) is a dropdown in its header, and changing it keeps every well that still fits.

<!-- screenshot: a 96-well plate with three painted groups and a heat map of values -->

## Layout: groups and painting

The legend on the right lists **groups** — what went into a set of wells: a strain, a compound, a buffer, "blank". Add one with **+ group**, name it, and it becomes the brush: click a well to assign it, drag across wells to assign several, or click a row letter or column number to fill the whole row or column. **Erase** empties wells the same way; **Inspect** turns painting off so clicking a well opens it instead.

A group can be a registry entity: start typing its name and pick it from the suggestions. The group then shows the entity's type, the entity lists the document among its references, and the project feed shows it among the experiment's entities. Clearing the name or typing a new one detaches the entity again. The colour swatch cycles through the palette on click.

Every group shows how many wells it covers; the line under the legend counts assigned wells.

## Notes per well

With **Inspect** on, clicking a well opens a small editor below the plate: its group, a free-text **note**, and its **value**. Notes are for what differs within a group — the concentration of a dilution series, "bubble", "edge well". When every annotated well of a column (or row) carries the same note, the block and the PDF say so once ("col 3: 2 µg/mL") instead of listing wells. A well with a note shows a small dot.

## Values from the reader

**Paste values…** opens a box: name what was measured (OD600, fluorescence, CFU …) and paste the reader export — one plate row per line, cells separated by tabs, commas, semicolons or spaces. A header row of column numbers and row letters in front are skipped, so most exports paste as they are; a decimal comma is understood when it is the only comma on the line. **Apply to wells** stores one value per well.

With values present the plate becomes a **heat map** (pale to deep per value, the group colour as a ring) and the legend shows **mean ± sd** per group over its measured wells. The header toggles between **Layout** and the measured view; **clear values** removes them, **Replace values…** pastes a new set.

Values are not quantities in the text: they are not summed into usages and they carry no unit beyond the measure's name. Write the conclusion in the prose, as always.

## Clones and the PDF

A [clone](history.md) of the experiment keeps the plate's layout and notes and drops the values, so the next run starts from the same plate. The PDF export draws the plate with its colours and values, the legend with counts and means, the value range and the note summary.
