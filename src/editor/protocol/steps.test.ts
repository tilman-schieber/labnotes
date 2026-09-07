import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Schema } from '@tiptap/pm/model';
import { collectSteps, describeConditions, stepConditions } from './steps.ts';

// A stand-in for the editor schema with the node names the collector looks at. Building it here
// keeps the test free of the editor, which needs a DOM.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    heading: { content: 'inline*', group: 'block', toDOM: () => ['h1', 0] },
    bulletList: { content: 'listItem+', group: 'block', toDOM: () => ['ul', 0] },
    orderedList: { content: 'listItem+', group: 'block', toDOM: () => ['ol', 0] },
    taskList: { content: 'taskItem+', group: 'block', toDOM: () => ['ul', 0] },
    listItem: { content: 'paragraph block*', toDOM: () => ['li', 0] },
    taskItem: { content: 'paragraph block*', attrs: { checked: { default: false } }, toDOM: () => ['li', 0] },
    quantity: {
      inline: true,
      group: 'inline',
      atom: true,
      attrs: { value: { default: 0 }, unit: { default: '' } },
      toDOM: () => ['span']
    },
    timestamp: { inline: true, group: 'inline', atom: true, attrs: { at: { default: null } }, toDOM: () => ['span'] },
    text: { group: 'inline' }
  },
  marks: {}
});

const { doc, paragraph, heading, bulletList, orderedList, taskList, listItem, taskItem, quantity, timestamp } = schema.nodes;

const para = (...content: Parameters<typeof paragraph.create>[2][]) => paragraph.create(null, content as never);
const item = (text: string) => listItem.create(null, para(schema.text(text) as never));

test('list items are the steps, in document order', () => {
  const document = doc.create(null, [
    heading.create(null, schema.text('Preparation')),
    para(schema.text('The mixture was stirred overnight; this is narrative, not a step.') as never),
    orderedList.create(null, [item('Add buffer to the tube'), item('Stir until dissolved')]),
    para(schema.text('Add 5 mL of buffer — a paragraph starting with a verb is no longer a step.') as never),
    bulletList.create(null, [item('Wash twice')])
  ]);

  const steps = collectSteps(document);
  assert.deepEqual(
    steps.map((step) => [step.index, step.text, step.ordered]),
    [
      [1, 'Add buffer to the tube', true],
      [2, 'Stir until dissolved', true],
      [3, 'Wash twice', false]
    ]
  );
});

test('a document without lists has no steps', () => {
  const document = doc.create(null, [heading.create(null, schema.text('Title')), para(schema.text('Add 5 mL of buffer.') as never)]);
  assert.deepEqual(collectSteps(document), []);
});

test('textPos lands inside the item so the caret can be placed there', () => {
  const document = doc.create(null, [bulletList.create(null, [item('Weigh the solid')])]);
  const [step] = collectSteps(document);
  const resolved = document.resolve(step.textPos);
  assert.equal(resolved.parent.type.name, 'paragraph');
  assert.equal(resolved.parent.textContent, 'Weigh the solid');
});

test('quantities and timestamps inside an item become its conditions', () => {
  const document = doc.create(null, [
    orderedList.create(null, [
      listItem.create(null, [
        para(
          schema.text('Incubate for ') as never,
          quantity.create({ value: 10, unit: 'min' }) as never,
          schema.text(' at ') as never,
          quantity.create({ value: 37, unit: '°C' }) as never,
          timestamp.create({ at: '2026-03-04T09:15:00.000Z' }) as never
        )
      ])
    ])
  ]);

  const [step] = collectSteps(document);
  assert.equal(describeConditions(step.conditions), '10 min · 37 °C');
  assert.deepEqual(step.timestamps, ['2026-03-04T09:15:00.000Z']);
  assert.equal(step.text, 'Incubate for 10 min at 37 °C');
});

test('nested lists belong to their parent step rather than counting twice', () => {
  const document = doc.create(null, [
    orderedList.create(null, [
      listItem.create(null, [para(schema.text('Prepare the buffer') as never), bulletList.create(null, [item('weigh salts')])])
    ])
  ]);

  const steps = collectSteps(document);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].text, 'Prepare the buffer weigh salts');
});

test('task items carry their checkbox', () => {
  const document = doc.create(null, [
    taskList.create(null, [
      taskItem.create({ checked: true }, [para(schema.text('Autoclave the media') as never)]),
      taskItem.create({ checked: false }, [para(schema.text('Cool to 50 °C') as never)])
    ])
  ]);

  assert.deepEqual(
    collectSteps(document).map((step) => step.done),
    [true, false]
  );
});

test('conditions pick the first duration and temperature', () => {
  const conditions = stepConditions([
    { value: 5, unit: 'mL' },
    { value: 10, unit: 'min' },
    { value: 60, unit: '°C' },
    { value: 2, unit: 'h' }
  ]);
  assert.deepEqual(conditions, { duration: { value: 10, unit: 'min' }, temperature: { value: 60, unit: '°C' } });
  assert.equal(describeConditions(conditions), '10 min · 60 °C');
  assert.equal(describeConditions(stepConditions([{ value: 1, unit: 'g' }])), '');
});
