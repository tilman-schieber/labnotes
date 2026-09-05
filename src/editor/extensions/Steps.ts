import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describeConditions, stepConditions, stepVerb, type StepConditions } from '../protocol/steps';
import type { Quantity } from '../../units/quantity';

export type ProtocolStep = {
  index: number;
  pos: number;
  verb: string;
  text: string;
  conditions: StepConditions;
  // ISO instants of timestamp tokens in the step
  timestamps: string[];
};

type StepsState = { decorations: DecorationSet; steps: ProtocolStep[] };

export const stepsKey = new PluginKey<StepsState>('protocolSteps');

function stepText(node: ProseMirrorNode): string {
  let text = '';
  node.descendants((child) => {
    if (child.isText) {
      text += child.text ?? '';
    } else if (child.type.name === 'entityMention') {
      text += String(child.attrs.label ?? '');
    } else if (child.type.name === 'quantity') {
      text += `${child.attrs.value} ${child.attrs.unit}`;
    }
    return true;
  });
  return text.replace(/\s+/g, ' ').trim();
}

// Top-level paragraphs that read as instructions, numbered in document order. Lists number
// themselves, so paragraphs inside them are left alone.
function collect(state: EditorState): StepsState {
  const steps: ProtocolStep[] = [];
  const decorations: Decoration[] = [];

  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') {
      return;
    }
    const text = stepText(node);
    const verb = stepVerb(text);
    if (!verb) {
      return;
    }
    const quantities: Quantity[] = [];
    const timestamps: string[] = [];
    node.descendants((child) => {
      if (child.type.name === 'quantity') {
        quantities.push({ value: Number(child.attrs.value), unit: String(child.attrs.unit) });
      } else if (child.type.name === 'timestamp' && child.attrs.at) {
        timestamps.push(String(child.attrs.at));
      }
      return true;
    });
    const conditions = stepConditions(quantities);
    const index = steps.length + 1;
    steps.push({ index, pos: offset, verb, text, conditions, timestamps });
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, {
        class: 'protocol-step',
        'data-step': String(index),
        'data-conditions': describeConditions(conditions)
      })
    );
  });

  return { decorations: DecorationSet.create(state.doc, decorations), steps };
}

export const ProtocolSteps = Extension.create({
  name: 'protocolSteps',

  addStorage() {
    return { steps: [] as ProtocolStep[] };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin<StepsState>({
        key: stepsKey,
        state: {
          init: (_config, state) => {
            const next = collect(state);
            extension.storage.steps = next.steps;
            return next;
          },
          apply: (tr, previous, _old, state) => {
            if (!tr.docChanged) {
              return previous;
            }
            const next = collect(state);
            extension.storage.steps = next.steps;
            return next;
          }
        },
        props: {
          decorations: (state) => stepsKey.getState(state)?.decorations ?? null
        }
      })
    ];
  }
});
