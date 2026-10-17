import type { Editor } from '@tiptap/core';
import { useMemo } from 'react';
import { blankPositions } from '../editor/extensions/Blank';
import { convert, findUnit, formatQuantity, type Quantity } from '../units/quantity';

// An experiment started from a template or a clone carries the planned amounts on its quantity
// tokens. This panel is the deviation list: every amount that differs from the plan, and the
// blanks still to fill. Read from the editor document on every save.

type Deviation = { pos: number; planned: Quantity; actual: Quantity; percent: number | null; context: string };

export function findDeviations(editor: Editor): Deviation[] {
  const found: Deviation[] = [];
  const doc = editor.state.doc;
  doc.descendants((node, pos) => {
    if (node.type.name !== 'quantity' || !node.attrs.planned) {
      return;
    }
    const planned = node.attrs.planned as Quantity;
    const actual = { value: Number(node.attrs.value), unit: String(node.attrs.unit) };
    if (planned.value === actual.value && planned.unit === actual.unit) {
      return;
    }
    let percent: number | null = null;
    const plannedUnit = findUnit(planned.unit);
    const actualUnit = findUnit(actual.unit);
    if (plannedUnit && actualUnit && plannedUnit.dimension === actualUnit.dimension && planned.value !== 0) {
      const comparable = convert(actual, planned.unit);
      percent = ((comparable.value - planned.value) / planned.value) * 100;
    }
    const $pos = doc.resolve(pos);
    const block = $pos.parent;
    const text = block.textBetween(0, block.content.size, ' ', (leaf) => (leaf.type.name === 'quantity' ? formatQuantity(leaf.attrs as Quantity) : leaf.type.name === 'entityMention' ? String(leaf.attrs.label ?? '') : ' '));
    found.push({ pos, planned, actual, percent, context: text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text });
  });
  return found;
}

export default function DeviationsPanel({ editor, refreshToken }: { editor: Editor | null; refreshToken: number }) {
  const deviations = useMemo(() => (editor ? findDeviations(editor) : []), [editor, refreshToken]);
  const blanks = useMemo(() => (editor ? blankPositions(editor.state.doc) : []), [editor, refreshToken]);
  const planned = useMemo(() => {
    let count = 0;
    editor?.state.doc.descendants((node) => {
      if (node.type.name === 'quantity' && node.attrs.planned) {
        count += 1;
      }
    });
    return count;
  }, [editor, refreshToken]);

  if (!editor || (planned === 0 && blanks.length === 0)) {
    return null;
  }

  const jump = (pos: number) => editor.chain().focus().setNodeSelection(pos).scrollIntoView().run();

  return (
    <section className="deviations-panel">
      <div className="deviations-head">
        <strong>Plan vs. done</strong>
        <span className="entity-muted">
          {planned} planned {planned === 1 ? 'amount' : 'amounts'}, {deviations.length} changed
          {blanks.length > 0 && ` · ${blanks.length} ${blanks.length === 1 ? 'blank' : 'blanks'} left`}
        </span>
        {blanks.length > 0 && (
          <button type="button" className="link-button" onClick={() => jump(blanks[0])} title="Tab in the text jumps to the next blank">
            next blank
          </button>
        )}
      </div>
      {deviations.length > 0 && (
        <ul className="deviations-list">
          {deviations.map((deviation) => (
            <li key={deviation.pos}>
              <button type="button" className="link-button deviations-jump" onClick={() => jump(deviation.pos)}>
                <span className="deviations-planned">{formatQuantity(deviation.planned)}</span>
                <span className="deviations-arrow">→</span>
                <span className="deviations-actual">{formatQuantity(deviation.actual)}</span>
                {deviation.percent !== null && (
                  <span className={`deviations-percent${Math.abs(deviation.percent) >= 10 ? ' is-large' : ''}`}>
                    {deviation.percent > 0 ? '+' : ''}
                    {Math.round(deviation.percent)} %
                  </span>
                )}
              </button>
              <span className="usage-sentence" title={deviation.context}>
                “{deviation.context}”
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
