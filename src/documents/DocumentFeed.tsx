import { useMemo } from 'react';
import type { NotebookExperiment, NotebookProject } from '../storage/documentStore';
import { STATUS_LABELS } from '../editor/ExperimentMeta';
import { formatExperimentNumber } from '../chemistry/batchCode';
import { summarizeDocument } from './summary';
import { IconBeaker, IconPlus } from '../ui/icons';

type Props = {
  kind: 'project' | 'group';
  projects: NotebookProject[];
  experiments: NotebookExperiment[];
  onOpenDocument: (documentId: string) => void;
  onOpenEntity: (entityId: string) => void;
  // Only for projects: start the next experiment here.
  onNewExperiment?: () => void;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function experimentDate(experiment: NotebookExperiment): string {
  return experiment.metadata.date ?? experiment.createdAt.slice(0, 10);
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

// The table of contents of a project: its experiments, newest first, each with number, status,
// date, first line and the things it references. A group shows the same per project.
export default function DocumentFeed({ kind, projects, experiments, onOpenDocument, onOpenEntity, onNewExperiment }: Props) {
  const sections = useMemo(
    () =>
      projects.map((project) => ({
        project,
        experiments: experiments
          .filter((experiment) => experiment.projectId === project.id)
          .sort((left, right) => experimentDate(right).localeCompare(experimentDate(left)) || (right.metadata.number ?? 0) - (left.metadata.number ?? 0))
      })),
    [projects, experiments]
  );

  return (
    <div className="feed">
      {kind === 'project' && (
        <div className="feed-head">
          <span className="panel-title">
            <IconBeaker size={14} />
            Experiments · {experiments.length}
          </span>
          {onNewExperiment && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewExperiment} title="Start today's experiment in this project (Alt+N)">
              <IconPlus size={14} />
              New experiment
            </button>
          )}
        </div>
      )}
      {sections.map(({ project, experiments: items }) => (
        <section key={project.id} className="feed-section">
          {kind === 'group' && (
            <button type="button" className="feed-project" onClick={() => onOpenDocument(project.id)}>
              {project.name}
              <span className="feed-count">
                {items.length} {items.length === 1 ? 'experiment' : 'experiments'}
              </span>
            </button>
          )}
          {items.length === 0 ? (
            <div className="feed-empty">{kind === 'project' ? 'No experiments yet. Start one with the button above or Alt+N.' : 'No experiments yet.'}</div>
          ) : (
            <ol className="feed-list">
              {items.map((experiment) => {
                const summary = summarizeDocument(experiment.content);
                return (
                  <li key={experiment.id} className="feed-row">
                    <button type="button" className="feed-row-main" onClick={() => onOpenDocument(experiment.id)}>
                      <span className="feed-row-head">
                        {experiment.metadata.number && <span className="tree-number">{formatExperimentNumber(experiment.metadata.number)}</span>}
                        <span className="feed-title">{experiment.title}</span>
                        {experiment.metadata.status && (
                          <span className={`feed-status status-pill-text status-${experiment.metadata.status}`}>
                            <span className={`status-dot status-${experiment.metadata.status}`} />
                            {STATUS_LABELS[experiment.metadata.status]}
                          </span>
                        )}
                        <span className="feed-date">{formatDate(experimentDate(experiment))}</span>
                      </span>
                      {summary.firstLine && <span className="feed-line">{summary.firstLine}</span>}
                    </button>
                    {(summary.entities.length > 0 || (experiment.metadata.tags?.length ?? 0) > 0) && (
                      <div className="feed-row-meta">
                        {summary.entities.slice(0, 8).map((entity) => (
                          <button key={entity.id} type="button" className={`linked-entity linked-entity-${entity.type}`} onClick={() => onOpenEntity(entity.id)} title="Open in registry">
                            {entity.label}
                          </button>
                        ))}
                        {summary.entities.length > 8 && <span className="feed-more">+{summary.entities.length - 8}</span>}
                        {experiment.metadata.tags?.map((tag) => (
                          <span key={tag} className="tag-chip">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
