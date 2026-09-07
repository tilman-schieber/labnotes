import { lazy, Suspense, useEffect, useState } from 'react';
import { normaliseReactionSmiles, smilesToSvg } from '../chemistry/molecule';
import { describeConditions, type ReactionConditions } from '../chemistry/conditions';
import type { ReactionComponent } from '../chemistry/reaction';
import { parseScheme, schemeFromComponents } from '../chemistry/scheme';

const StructureEditorDialog = lazy(() => import('../registry/StructureEditorDialog'));

type Props = {
  components: ReactionComponent[];
  conditions: ReactionConditions | null;
  // A hand-drawn reaction SMILES; null means the scheme follows the rows.
  scheme: string | null;
  disabled: boolean;
  onChange: (scheme: string | null) => void;
};

function Molecule({ smiles, label }: { smiles: string; label?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    smilesToSvg(smiles, 170, 110)
      .then((image) => {
        if (!cancelled) {
          setSvg(image);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [smiles]);
  return (
    <div className="reaction-scheme-molecule" title={smiles}>
      {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="entity-muted">{smiles}</span>}
      {label && <span className="reaction-scheme-label">{label}</span>}
    </div>
  );
}

// Reactants → products with the conditions over the arrow and reagents under it. Follows the
// table until someone draws the scheme by hand; "from rows" goes back to following it.
export default function SchemeView({ components, conditions, scheme, disabled, onChange }: Props) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const derived = schemeFromComponents(components);
  const effective = scheme ?? derived;
  const parts = parseScheme(effective);
  const labelFor = (smiles: string) => (scheme ? undefined : components.find((component) => component.smiles === smiles)?.label);

  const save = async (drawn: string) => {
    setIsEditorOpen(false);
    if (!drawn.trim()) {
      onChange(null);
      return;
    }
    const normalised = await normaliseReactionSmiles(drawn);
    if (!normalised) {
      setError('Could not read the drawn reaction');
      return;
    }
    setError(null);
    onChange(normalised);
  };

  return (
    <div className="reaction-scheme-wrap">
      {parts ? (
        <div className="reaction-scheme">
          {parts.reactants.map((smiles, index) => (
            <span key={`r-${index}`} style={{ display: 'contents' }}>
              {index > 0 && <span className="reaction-scheme-plus">+</span>}
              <Molecule smiles={smiles} label={labelFor(smiles)} />
            </span>
          ))}
          <div className="reaction-scheme-arrow">
            <span>{describeConditions(conditions)}</span>
            <span className="reaction-scheme-arrow-line" />
            <span>{parts.agents.map((smiles) => labelFor(smiles) ?? smiles).join(', ')}</span>
          </div>
          {parts.products.map((smiles, index) => (
            <span key={`p-${index}`} style={{ display: 'contents' }}>
              {index > 0 && <span className="reaction-scheme-plus">+</span>}
              <Molecule smiles={smiles} label={labelFor(smiles)} />
            </span>
          ))}
        </div>
      ) : (
        <div className="reaction-scheme-empty">No scheme yet: link rows to registry compounds with structures, or draw one.</div>
      )}
      {error && <div className="entity-error">{error}</div>}
      {!disabled && (
        <div className="reaction-scheme-actions">
          <button type="button" className="link-button" onClick={() => setIsEditorOpen(true)}>
            {parts ? 'Edit scheme' : 'Draw scheme'}
          </button>
          {scheme && (
            <button type="button" className="link-button" onClick={() => onChange(null)} title="Discard the drawing and follow the table rows again">
              ↻ from rows
            </button>
          )}
        </div>
      )}
      {isEditorOpen && (
        <Suspense fallback={null}>
          <StructureEditorDialog initialStructure={effective ?? ''} mode="reaction" onCancel={() => setIsEditorOpen(false)} onSave={(drawn) => void save(drawn)} />
        </Suspense>
      )}
    </div>
  );
}
