// Suggestions: a second look at a saved experiment by something that is not the deterministic
// pipeline — a language model, later. Nothing here calls one. Providers get the document, its
// derived usages, its reaction tables (with the computed stoichiometry) and the referenced
// entities, and return suggestions the reaction block shows with an "Apply" button. A
// suggestion never changes the text on its own.
//
//   Suggestion = {
//     kind: 'role' | 'condition' | 'amount' | 'duplicate' | 'hazard' | 'text',
//     message: string,
//     target?: { documentId, blockIndex?, componentId? },
//     patch?: object,          // applied to the targeted reaction component on "Apply"
//     provider: string
//   }
//   SuggestionProvider = { name: string, suggest(context) => Promise<Suggestion[]> }
//
// SUGGEST_PROVIDER names the provider to load: "none" (default) loads ./noop.mjs.
import { computeReaction } from '../../../src/chemistry/reaction.ts';
import { extractUsages } from '../../../src/chemistry/usages.ts';

const KINDS = new Set(['role', 'condition', 'amount', 'duplicate', 'hazard', 'text']);

const providers = new Map();

export function registerProvider(provider) {
  if (!provider || typeof provider.name !== 'string' || typeof provider.suggest !== 'function') {
    throw new Error('A suggestion provider needs a name and a suggest() function');
  }
  providers.set(provider.name, provider);
}

export function unregisterProvider(name) {
  providers.delete(name);
}

export function listProviders() {
  return [...providers.keys()];
}

// What every provider sees. Pure: build it from a document and the entities it references.
export function buildContext(document, entities = new Map()) {
  const content = document.content ?? { type: 'doc', content: [] };
  const reactions = [];
  (content.content ?? []).forEach((node, blockIndex) => {
    if (node.type === 'reaction') {
      const components = Array.isArray(node.attrs?.components) ? node.attrs.components : [];
      reactions.push({ blockIndex, attrs: node.attrs ?? {}, summary: computeReaction(components) });
    }
  });
  return {
    document: { id: document.id, title: document.title, kind: document.kind, metadata: document.metadata ?? {}, content },
    usages: extractUsages(content),
    reactions,
    entities
  };
}

function normalise(suggestion, providerName) {
  if (!suggestion || typeof suggestion !== 'object' || typeof suggestion.message !== 'string') {
    return null;
  }
  return {
    kind: KINDS.has(suggestion.kind) ? suggestion.kind : 'text',
    message: suggestion.message,
    target: suggestion.target && typeof suggestion.target === 'object' ? suggestion.target : null,
    patch: suggestion.patch && typeof suggestion.patch === 'object' ? suggestion.patch : null,
    provider: providerName
  };
}

// Every registered provider, in registration order; a failing provider is skipped, not fatal.
export async function suggestFor(context) {
  const results = [];
  for (const provider of providers.values()) {
    try {
      const suggestions = await provider.suggest(context);
      for (const suggestion of Array.isArray(suggestions) ? suggestions : []) {
        const item = normalise(suggestion, provider.name);
        if (item) {
          results.push(item);
        }
      }
    } catch (error) {
      results.push({ kind: 'text', message: `${provider.name}: ${error instanceof Error ? error.message : 'failed'}`, target: null, patch: null, provider: provider.name });
    }
  }
  return results;
}

// Loads the configured provider once. Unknown names fall back to the no-op provider.
let loaded = null;
export async function loadConfiguredProvider(name = process.env.SUGGEST_PROVIDER ?? 'none') {
  if (loaded) {
    return loaded;
  }
  const module = name === 'none' || !name ? await import('./noop.mjs') : await import(`./${name.replace(/[^a-z0-9_-]/gi, '')}.mjs`).catch(() => import('./noop.mjs'));
  loaded = module.default;
  registerProvider(loaded);
  return loaded;
}
