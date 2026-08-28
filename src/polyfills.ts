// Ketcher's bundle (via the `util`/`assert` Node shims) reads `process.env` at module load.
// Vite provides neither, so give it the minimum before any lazy chunk can run.
type ProcessShim = { env: Record<string, string | undefined>; platform: string; version: string; versions: Record<string, string> };

const globalScope = globalThis as typeof globalThis & { process?: ProcessShim; global?: typeof globalThis };

if (typeof globalScope.process === 'undefined') {
  globalScope.process = { env: {}, platform: 'browser', version: '', versions: {} };
}

if (typeof globalScope.global === 'undefined') {
  globalScope.global = globalThis;
}
