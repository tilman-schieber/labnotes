import { Component, Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Ketcher } from 'ketcher-core';

// Ketcher (with its Indigo WASM) is only downloaded when the dialog opens.
const KetcherEditor = lazy(() => import('./KetcherEditor'));

// Keeps a failing editor chunk inside the dialog instead of unmounting the whole app.
class EditorBoundary extends Component<{ onError: (message: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'The structure editor failed to load');
  }

  render() {
    return this.state.failed ? <div className="structure-editor-loading">Structure editor unavailable</div> : this.props.children;
  }
}

type Props = {
  // A molecule SMILES, or a reaction SMILES ("A.B>C>D") in reaction mode.
  initialStructure: string;
  mode?: 'molecule' | 'reaction';
  onCancel: () => void;
  onSave: (structure: string) => void;
};

export default function StructureEditorDialog({ initialStructure, mode = 'molecule', onCancel, onSave }: Props) {
  const ketcherRef = useRef<Ketcher | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const ketcher = ketcherRef.current;
    if (!ketcher) {
      return;
    }

    setIsSaving(true);
    try {
      // Isomeric SMILES keeps stereo; Ketcher returns '' for an empty canvas. With a reaction on
      // the canvas it returns reaction SMILES, which is what a scheme wants.
      const smiles = (await ketcher.getSmiles(true)).trim();
      if (mode === 'reaction' && smiles && !ketcher.containsReaction()) {
        setError('Draw a reaction (reactants, an arrow, products), not a single structure');
        setIsSaving(false);
        return;
      }
      onSave(smiles);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not read the structure');
      setIsSaving(false);
    }
  };

  // Portalled to <body> so the registry's form styling does not leak into Ketcher's toolbars.
  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Structure editor">
      <div className="modal structure-editor-modal">
        <div className="modal-header">
          <strong>{mode === 'reaction' ? 'Edit scheme' : 'Edit structure'}</strong>
          <span className="entity-muted">
            {mode === 'reaction' ? 'Draw the reaction: reactants, arrow, products (Ketcher). Reagents go above the arrow.' : 'Draw or paste a structure (Ketcher), then use it to update the SMILES.'}
          </span>
        </div>
        <div className="structure-editor-host">
          <EditorBoundary onError={setError}>
            <Suspense fallback={<div className="structure-editor-loading">Loading structure editor…</div>}>
              <KetcherEditor
                initialStructure={initialStructure}
                onReady={(ketcher) => {
                  ketcherRef.current = ketcher;
                  setIsReady(true);
                }}
                onError={setError}
              />
            </Suspense>
          </EditorBoundary>
        </div>
        {error && <div className="entity-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={!isReady || isSaving}>
            {isSaving ? 'Reading…' : mode === 'reaction' ? 'Use scheme' : 'Use structure'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
