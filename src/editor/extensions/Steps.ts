import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { collectSteps, type ProtocolStep } from '../protocol/steps';

export type { ProtocolStep } from '../protocol/steps';

type StepsState = { steps: ProtocolStep[] };

export const stepsKey = new PluginKey<StepsState>('protocolSteps');

// The list items of the document, kept in editor storage for the Steps panel. Lists draw their
// own markers, so nothing is decorated here.
export const ProtocolSteps = Extension.create({
  name: 'protocolSteps',

  addStorage() {
    return { steps: [] as ProtocolStep[] };
  },

  addProseMirrorPlugins() {
    const extension = this;
    const read = (state: EditorState): StepsState => {
      const steps = collectSteps(state.doc);
      extension.storage.steps = steps;
      return { steps };
    };

    return [
      new Plugin<StepsState>({
        key: stepsKey,
        state: {
          init: (_config, state) => read(state),
          apply: (tr, previous, _old, state) => (tr.docChanged ? read(state) : previous)
        }
      })
    ];
  }
});
