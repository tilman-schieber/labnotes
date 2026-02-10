import {
  Extension,
  InputRule,
  markInputRule,
  wrappingInputRule,
  textblockTypeInputRule
} from '@tiptap/core';

export const MarkdownShortcuts = Extension.create({
  name: 'markdownShortcuts',

  addInputRules() {
    const rules: InputRule[] = [];

    const italic = this.editor.schema.marks.italic;
    if (italic) {
      rules.push(markInputRule({ find: /(?:^|\s)\*([^*\n]+)\*$/, type: italic }));
      rules.push(markInputRule({ find: /(?:^|\s)_([^_\n]+)_$/, type: italic }));
    }

    const bold = this.editor.schema.marks.bold;
    if (bold) {
      rules.push(markInputRule({ find: /(?:^|\s)\*\*([^*\n]+)\*\*$/, type: bold }));
      rules.push(markInputRule({ find: /(?:^|\s)__([^_\n]+)__$/, type: bold }));
    }

    const heading = this.editor.schema.nodes.heading;
    if (heading) {
      rules.push(textblockTypeInputRule({ find: /^#\s$/, type: heading, getAttributes: { level: 1 } }));
      rules.push(textblockTypeInputRule({ find: /^##\s$/, type: heading, getAttributes: { level: 2 } }));
      rules.push(textblockTypeInputRule({ find: /^###\s$/, type: heading, getAttributes: { level: 3 } }));
      rules.push(textblockTypeInputRule({ find: /^####\s$/, type: heading, getAttributes: { level: 4 } }));
      rules.push(textblockTypeInputRule({ find: /^#####\s$/, type: heading, getAttributes: { level: 5 } }));
      rules.push(textblockTypeInputRule({ find: /^######\s$/, type: heading, getAttributes: { level: 6 } }));
    }

    const bulletList = this.editor.schema.nodes.bulletList;
    if (bulletList) {
      rules.push(wrappingInputRule({ find: /^\s*([-+*])\s$/, type: bulletList }));
    }

    return rules;
  }
});
