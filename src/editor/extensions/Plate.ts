import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createPlate, isPlateFormat, type PlateAttrs, type PlateFormat, type PlateGroup, type PlateWell } from '../../plates/plate';
import PlateView from '../PlateView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    plate: {
      insertPlate: (format?: PlateFormat) => ReturnType;
    };
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Block-level microplate: a legend of groups (optionally registry entities, so the mention index
// treats them as references), the wells each group occupies, and one measured value per well.
export const PlateNode = Node.create({
  name: 'plate',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? ''
      },
      format: {
        default: 96,
        parseHTML: (element) => {
          const value = Number(element.getAttribute('data-format'));
          return isPlateFormat(value) ? value : 96;
        },
        renderHTML: (attributes) => ({ 'data-format': String(attributes.format) })
      },
      groups: {
        default: [],
        parseHTML: (element) => parseJson<PlateGroup[]>(element.getAttribute('data-groups'), []),
        renderHTML: (attributes) => ({ 'data-groups': JSON.stringify(attributes.groups ?? []) })
      },
      wells: {
        default: {},
        parseHTML: (element) => parseJson<Record<string, PlateWell>>(element.getAttribute('data-wells'), {}),
        renderHTML: (attributes) => ({ 'data-wells': JSON.stringify(attributes.wells ?? {}) })
      },
      measure: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-measure') ?? ''
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="plate"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as PlateAttrs;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'plate', 'data-title': attrs.title, 'data-measure': attrs.measure, class: 'plate-block' }), attrs.title || `${attrs.format}-well plate`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlateView);
  },

  addCommands() {
    return {
      insertPlate:
        (format = 96) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: createPlate(format) })
    };
  }
});
