import { useEffect, useState } from 'react';
import { fetchEntities, type BackendEntityListItem } from '../api/backend';
import { describeSmiles, formatWeight, smilesToSvg, type CompoundAttributes, type MoleculeDescription } from '../chemistry/molecule';
import { lookupCompound } from '../chemistry/pubchem';
import StructureEditorDialog from './StructureEditorDialog';

type Props = {
  entityId: string;
  label: string;
  attributes: CompoundAttributes;
  // Persists a partial attribute update (merged server-side by the caller) and reloads.
  onSaveAttributes: (patch: Record<string, unknown>) => Promise<void>;
  onMergeInto: (target: BackendEntityListItem) => void;
};

export default function CompoundPanel({ entityId, label, attributes, onSaveAttributes, onMergeInto }: Props) {
  const [smilesInput, setSmilesInput] = useState(attributes.smiles ?? '');
  const [preview, setPreview] = useState<MoleculeDescription | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<BackendEntityListItem | null>(null);

  useEffect(() => {
    setSmilesInput(attributes.smiles ?? '');
  }, [attributes.smiles]);

  // Validate and render whatever is in the input, debounced.
  useEffect(() => {
    const smiles = smilesInput.trim();
    if (!smiles) {
      setPreview(null);
      setSvg(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      Promise.all([describeSmiles(smiles), smilesToSvg(smiles, 280, 180)])
        .then(([description, image]) => {
          if (cancelled) {
            return;
          }
          setPreview(description);
          setSvg(image);
          setError(description ? null : 'Not a valid SMILES');
        })
        .catch(() => {
          if (!cancelled) {
            setError('Could not parse SMILES');
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [smilesInput]);

  // Same canonical structure elsewhere in the registry -> offer a merge.
  useEffect(() => {
    if (!preview?.idCode) {
      setDuplicate(null);
      return;
    }

    let cancelled = false;
    fetchEntities({ q: preview.idCode, type: 'compound' })
      .then((result) => {
        if (!cancelled) {
          setDuplicate(result.entities.find((item) => item.id !== entityId && item.attributes?.idCode === preview.idCode) ?? null);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [preview?.idCode, entityId]);

  const isDirty = smilesInput.trim() !== (attributes.smiles ?? '');

  const handleApply = async () => {
    if (!preview) {
      return;
    }

    setIsBusy(true);
    try {
      await onSaveAttributes({ ...preview });
      setStatus('Structure saved');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClear = async () => {
    setIsBusy(true);
    try {
      await onSaveAttributes({
        smiles: null,
        idCode: null,
        formula: null,
        molecularWeight: null,
        exactMass: null,
        logP: null,
        tpsa: null,
        hDonors: null,
        hAcceptors: null
      });
      setSmilesInput('');
      setStatus('Structure cleared');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePubChem = async () => {
    const query = attributes.casNumber || label;
    setIsBusy(true);
    setStatus(`Looking up "${query}" in PubChem…`);
    try {
      const result = await lookupCompound(query);
      const description = await describeSmiles(result.smiles);
      await onSaveAttributes({
        ...(description ?? { smiles: result.smiles }),
        casNumber: result.casNumber ?? attributes.casNumber ?? null,
        iupacName: result.iupacName,
        pubchemCid: result.cid
      });
      setSmilesInput(description?.smiles ?? result.smiles);
      setStatus(`Loaded from PubChem (CID ${result.cid})`);
      setError(null);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'PubChem lookup failed');
      setStatus(null);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="entity-section compound-panel">
      <h3>Structure</h3>

      <div className="compound-layout">
        <div className="compound-structure">
          {svg ? (
            <div className="compound-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="compound-svg compound-svg-empty">{smilesInput.trim() ? 'Invalid structure' : 'No structure yet'}</div>
          )}
        </div>

        <dl className="compound-properties">
          <dt>Formula</dt>
          <dd>{preview?.formula ?? attributes.formula ?? '—'}</dd>
          <dt>MW</dt>
          <dd>{formatWeight(preview?.molecularWeight ?? attributes.molecularWeight)}</dd>
          <dt>Exact mass</dt>
          <dd>{(preview?.exactMass ?? attributes.exactMass)?.toFixed(4) ?? '—'}</dd>
          <dt>cLogP</dt>
          <dd>{preview?.logP ?? attributes.logP ?? '—'}</dd>
          <dt>TPSA</dt>
          <dd>{preview?.tpsa ?? attributes.tpsa ?? '—'}</dd>
          <dt>H donors / acceptors</dt>
          <dd>
            {preview?.hDonors ?? attributes.hDonors ?? '—'} / {preview?.hAcceptors ?? attributes.hAcceptors ?? '—'}
          </dd>
          {attributes.casNumber && (
            <>
              <dt>CAS</dt>
              <dd>{attributes.casNumber}</dd>
            </>
          )}
          {attributes.iupacName && (
            <>
              <dt>IUPAC</dt>
              <dd className="compound-iupac">{attributes.iupacName}</dd>
            </>
          )}
        </dl>
      </div>

      <label className="compound-smiles">
        SMILES
        <input
          type="text"
          value={smilesInput}
          onChange={(event) => {
            setSmilesInput(event.target.value);
            setStatus(null);
          }}
          placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
          spellCheck={false}
          disabled={isBusy}
        />
      </label>

      <div className="compound-actions">
        <button type="button" onClick={() => void handleApply()} disabled={isBusy || !preview || !isDirty}>
          Save structure
        </button>
        <button type="button" onClick={() => setIsEditorOpen(true)} disabled={isBusy}>
          Draw…
        </button>
        <button type="button" onClick={() => void handlePubChem()} disabled={isBusy}>
          Fetch from PubChem
        </button>
        {attributes.smiles && (
          <button type="button" className="link-button" onClick={() => void handleClear()} disabled={isBusy}>
            clear
          </button>
        )}
      </div>

      {status && <div className="entity-notice">{status}</div>}
      {error && <div className="entity-error">{error}</div>}
      {duplicate && (
        <div className="entity-hint">
          Same structure as <strong>{duplicate.label}</strong>.{' '}
          <button type="button" className="link-button" onClick={() => onMergeInto(duplicate)}>
            Merge this entity into it
          </button>
        </div>
      )}

      {isEditorOpen && (
        <StructureEditorDialog
          initialSmiles={smilesInput}
          onCancel={() => setIsEditorOpen(false)}
          onSave={(smiles) => {
            setIsEditorOpen(false);
            setSmilesInput(smiles);
          }}
        />
      )}
    </section>
  );
}
