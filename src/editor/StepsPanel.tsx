import type { Editor } from '@tiptap/core';
import { describeConditions } from './protocol/steps';
import { formatTimestamp } from './extensions/Timestamp';
import type { ProtocolStep } from './extensions/Steps';
import { IconList } from '../ui/icons';

type Props = { editor: Editor | null };

// The procedure as a numbered timeline, read straight from the paragraphs that start with an
// instruction. Clicking a step puts the caret there.
export default function StepsPanel({ editor }: Props) {
  const steps: ProtocolStep[] = editor?.storage.protocolSteps?.steps ?? [];

  const jump = (step: ProtocolStep) => {
    editor?.chain().focus().setTextSelection(step.pos + 1).scrollIntoView().run();
  };

  return (
    <div className="panel">
      <span className="panel-title">
        <IconList size={14} />
        Steps{steps.length > 0 ? ` · ${steps.length}` : ''}
      </span>
      {steps.length === 0 ? (
        <div className="linked-empty" style={{ marginTop: '0.4rem' }}>
          Paragraphs that start with an instruction (Add, Stir, Incubate…) are numbered as steps.
        </div>
      ) : (
        <ol className="steps-list">
          {steps.map((step) => {
            const conditions = describeConditions(step.conditions);
            return (
              <li key={step.pos}>
                <button type="button" className="steps-item" onClick={() => jump(step)} title="Go to this step">
                  <span className="steps-index">{step.index}</span>
                  <span className="steps-text">{step.text.length > 90 ? `${step.text.slice(0, 90)}…` : step.text}</span>
                  {(conditions || step.timestamps.length > 0) && (
                    <span className="steps-meta">
                      {[...step.timestamps.map(formatTimestamp), conditions].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
