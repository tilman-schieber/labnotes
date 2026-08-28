import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher } from 'ketcher-core';
import 'ketcher-react/dist/index.css';

// This module pulls in Ketcher + its Indigo WASM; it is only imported lazily from the dialog.
const structServiceProvider = new StandaloneStructServiceProvider();

type Props = {
  initialSmiles: string;
  onReady: (ketcher: Ketcher) => void;
  onError: (message: string) => void;
};

// onInit can fire more than once (React StrictMode double-mounts in dev); the latest instance
// is the live one, so every call re-loads the structure and hands the instance up.
export default function KetcherEditor({ initialSmiles, onReady, onError }: Props) {
  return (
    <Editor
      staticResourcesUrl=""
      structServiceProvider={structServiceProvider}
      disableMacromoleculesEditor
      errorHandler={(message) => onError(typeof message === 'string' ? message : String(message))}
      onInit={(ketcher) => {
        const load = initialSmiles.trim() ? ketcher.setMolecule(initialSmiles) : Promise.resolve();
        Promise.resolve(load)
          .catch(() => onError('Could not load the current SMILES into the editor'))
          .finally(() => onReady(ketcher));
      }}
    />
  );
}
