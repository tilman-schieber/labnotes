import { useEffect, useRef, useState } from 'react';
import type { CanvasEditor } from 'openchemlib';
import { loadOcl } from '../chemistry/molecule';

type Props = {
  initialSmiles: string;
  onCancel: () => void;
  onSave: (smiles: string) => void;
};

// Wraps OpenChemLib's CanvasEditor in a modal. The editor owns its DOM; React only supplies the host.
export default function StructureEditorDialog({ initialSmiles, onCancel, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<CanvasEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadOcl()
      .then(({ CanvasEditor: Editor, Molecule }) => {
        if (cancelled || !hostRef.current) {
          return;
        }

        const editor = new Editor(hostRef.current, { initialMode: 'molecule' });
        if (initialSmiles.trim()) {
          try {
            editor.setMolecule(Molecule.fromSmiles(initialSmiles));
          } catch {
            setError('Could not load the current SMILES into the editor');
          }
        }
        editorRef.current = editor;
        setIsReady(true);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Failed to load the structure editor');
      });

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [initialSmiles]);

  const handleSave = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const molecule = editor.getMolecule();
    if (molecule.getAllAtoms() === 0) {
      onSave('');
      return;
    }

    onSave(molecule.toIsomericSmiles());
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Structure editor">
      <div className="modal structure-editor-modal">
        <div className="modal-header">
          <strong>Edit structure</strong>
          <span className="entity-muted">Draw or paste a structure, then save to update the SMILES.</span>
        </div>
        <div className="structure-editor-host" ref={hostRef} />
        {error && <div className="entity-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!isReady}>
            Use structure
          </button>
        </div>
      </div>
    </div>
  );
}
