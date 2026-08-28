import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { fetchEntityLabels } from '../../api/backend';
import { buildMatcher, findRecognitions, type Matcher, type Recognition as RecognitionMatch } from '../recognition/matcher';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    recognition: {
      // Turns the recognised text at `from`..`to` into an entity token.
      linkRecognized: (from: number, to: number) => ReturnType;
      // Links every recognised name in the document.
      linkAllRecognized: () => ReturnType;
      refreshRecognition: () => ReturnType;
    };
  }
}

export const recognitionKey = new PluginKey<RecognitionState>('recognition');

type Hit = RecognitionMatch & { from: number; to: number };
type RecognitionState = { matcher: Matcher; decorations: DecorationSet; hits: Hit[] };

const REFRESH_MS = 60_000;

// Text nodes only; anything inside an atom (mention, quantity, reaction) is never text here.
function scan(doc: ProseMirrorNode, matcher: Matcher): Hit[] {
  const hits: Hit[] = [];
  if (!matcher.regex) {
    return hits;
  }
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }
    for (const recognition of findRecognitions(node.text, matcher)) {
      hits.push({ ...recognition, from: pos + recognition.start, to: pos + recognition.end });
    }
  });
  return hits;
}

function decorate(doc: ProseMirrorNode, hits: Hit[]): DecorationSet {
  return DecorationSet.create(
    doc,
    hits.map((hit) =>
      Decoration.inline(hit.from, hit.to, {
        class: `entity-hint entity-hint-${hit.type}`,
        title: `Known ${hit.type}: ${hit.label} — click to link`,
        'data-entity-id': hit.entityId
      })
    )
  );
}

function withMatcher(state: EditorState, matcher: Matcher): RecognitionState {
  const hits = scan(state.doc, matcher);
  return { matcher, decorations: decorate(state.doc, hits), hits };
}

// Underlines plain-text occurrences of registry names so the writer can link them with one click
// (or never, if they prefer). Purely advisory: it changes nothing until asked.
export const Recognition = Extension.create({
  name: 'recognition',

  addStorage() {
    return { count: 0, loadedAt: 0 };
  },

  addProseMirrorPlugins() {
    const extension = this;
    let matcher: Matcher = buildMatcher([]);

    const load = async () => {
      try {
        matcher = buildMatcher(await fetchEntityLabels());
        extension.storage.loadedAt = Date.now();
        extension.editor.view.dispatch(extension.editor.state.tr.setMeta(recognitionKey, { matcher }));
      } catch {
        // Recognition is optional; the editor works without it.
      }
    };

    return [
      new Plugin<RecognitionState>({
        key: recognitionKey,
        state: {
          init: (_config, state) => withMatcher(state, matcher),
          apply: (tr: Transaction, previous, _old, state) => {
            const meta = tr.getMeta(recognitionKey) as { matcher?: Matcher } | undefined;
            if (meta?.matcher) {
              const next = withMatcher(state, meta.matcher);
              extension.storage.count = next.hits.length;
              return next;
            }
            if (!tr.docChanged) {
              return previous;
            }
            const next = withMatcher(state, previous.matcher);
            extension.storage.count = next.hits.length;
            return next;
          }
        },
        props: {
          decorations: (state) => recognitionKey.getState(state)?.decorations ?? null,
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.classList.contains('entity-hint')) {
              return false;
            }
            const hit = recognitionKey.getState(view.state)?.hits.find((item) => item.from <= pos && pos <= item.to);
            if (!hit) {
              return false;
            }
            extension.editor.commands.linkRecognized(hit.from, hit.to);
            return true;
          }
        },
        view: () => {
          void load();
          const onFocus = () => {
            if (Date.now() - extension.storage.loadedAt > REFRESH_MS) {
              void load();
            }
          };
          extension.editor.on('focus', onFocus);
          const onEntitiesChanged = () => void load();
          window.addEventListener('labnotes:entities-changed', onEntitiesChanged);
          return {
            destroy: () => {
              extension.editor.off('focus', onFocus);
              window.removeEventListener('labnotes:entities-changed', onEntitiesChanged);
            }
          };
        }
      })
    ];
  },

  addCommands() {
    return {
      linkRecognized:
        (from, to) =>
        ({ state, tr, dispatch }) => {
          const hit = recognitionKey.getState(state)?.hits.find((item) => item.from === from && item.to === to);
          if (!hit) {
            return false;
          }
          if (dispatch) {
            const node = state.schema.nodes.entityMention.create({ id: hit.entityId, label: hit.label, entityType: hit.type, refType: 'entity' });
            tr.replaceWith(from, to, node);
          }
          return true;
        },
      linkAllRecognized:
        () =>
        ({ state, tr, dispatch }) => {
          const hits = recognitionKey.getState(state)?.hits ?? [];
          if (hits.length === 0) {
            return false;
          }
          if (dispatch) {
            // Replace from the end so earlier positions stay valid.
            [...hits]
              .sort((left, right) => right.from - left.from)
              .forEach((hit) => {
                const node = state.schema.nodes.entityMention.create({ id: hit.entityId, label: hit.label, entityType: hit.type, refType: 'entity' });
                tr.replaceWith(hit.from, hit.to, node);
              });
          }
          return true;
        },
      refreshRecognition:
        () =>
        ({ editor }) => {
          void fetchEntityLabels().then((entities) => {
            editor.view.dispatch(editor.state.tr.setMeta(recognitionKey, { matcher: buildMatcher(entities) }));
          });
          return true;
        }
    };
  }
});
