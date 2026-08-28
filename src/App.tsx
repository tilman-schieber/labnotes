import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import NotebookEditor from './editor/Editor';
import EntityRegistry from './registry/EntityRegistry';
import {
  type NotebookDocumentKind,
  createTemplateDocument,
  extractDocumentTitle,
  getDefaultTitle,
  withDocumentTitle
} from './documents/templates';
import { sanitizeLatex } from './editor/extensions/Math';
import {
  createTemplateFromDocument,
  deleteTemplate,
  fetchTemplate,
  fetchTemplates,
  updateDocumentMetadata,
  type BackendTemplate,
  type DocumentMetadata
} from './api/backend';
import ExperimentMeta, { STATUS_LABELS } from './editor/ExperimentMeta';
import {
  createBlankDocument,
  createNotebookDocument,
  deleteNotebookDocument,
  loadNotebookDb,
  saveActiveSelection,
  updateNotebookDocument,
  type NotebookActiveState,
  type NotebookDB,
  type NotebookGroup,
  type NotebookProject,
  type NotebookExperiment
} from './storage/documentStore';

type SelectedDocument = {
  kind: NotebookDocumentKind;
  id: string;
  title: string;
  content: JSONContent;
};

type PendingSave = {
  id: string;
  title: string;
  content: JSONContent;
};

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [db, setDb] = useState<NotebookDB | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  // Bumped when content is replaced outside the editor (e.g. restore) to remount it with fresh content.
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [view, setView] = useState<'notebook' | 'entities'>('notebook');
  const [templates, setTemplates] = useState<BackendTemplate[]>([]);

  const reloadTemplates = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates('experiment'));
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  const reloadDb = useCallback(async (preferredActive?: NotebookActiveState | null) => {
    setIsLoading(true);

    try {
      const nextDb = await loadNotebookDb(preferredActive);
      setDb(nextDb);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load notebook data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadDb();
  }, [reloadDb]);

  useEffect(() => {
    if (!db) {
      return;
    }

    saveActiveSelection(db.active);
  }, [db]);

  useEffect(() => {
    if (!pendingSave) {
      return;
    }

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      void updateNotebookDocument(pendingSave.id, pendingSave.title, pendingSave.content)
        .then(() => {
          setPendingSave((current) => (current === pendingSave ? null : current));
          setSaveState('idle');
        })
        .catch(() => {
          setSaveState('error');
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pendingSave]);

  const selectedDocument = useMemo<SelectedDocument | null>(() => {
    if (!db) {
      return null;
    }

    if (db.active.experimentId) {
      const experiment = db.experiments.find((item) => item.id === db.active.experimentId) ?? null;
      if (!experiment) {
        return null;
      }

      return {
        kind: 'experiment',
        id: experiment.id,
        title: experiment.title,
        content: experiment.content
      };
    }

    if (db.active.projectId) {
      const project = db.projects.find((item) => item.id === db.active.projectId) ?? null;
      if (!project) {
        return null;
      }

      return {
        kind: 'project',
        id: project.id,
        title: project.name,
        content: project.content
      };
    }

    if (db.active.groupId) {
      const group = db.groups.find((item) => item.id === db.active.groupId) ?? null;
      if (!group) {
        return null;
      }

      return {
        kind: 'group',
        id: group.id,
        title: group.name,
        content: group.content
      };
    }

    return null;
  }, [db]);

  const actions = useMemo(
    () => [
      {
        label: 'Bold',
        onClick: () => editor?.chain().focus().toggleBold().run(),
        isActive: Boolean(editor?.isActive('bold'))
      },
      {
        label: 'Italic',
        onClick: () => editor?.chain().focus().toggleItalic().run(),
        isActive: Boolean(editor?.isActive('italic'))
      },
      {
        label: 'H1',
        onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
        isActive: Boolean(editor?.isActive('heading', { level: 1 }))
      },
      {
        label: 'Bullet list',
        onClick: () => editor?.chain().focus().toggleBulletList().run(),
        isActive: Boolean(editor?.isActive('bulletList'))
      },
      {
        label: 'Task list',
        onClick: () => editor?.chain().focus().toggleTaskList().run(),
        isActive: Boolean(editor?.isActive('taskList'))
      },
      {
        label: 'Insert table',
        onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        isActive: false
      },
      {
        label: 'Reaction',
        onClick: () => editor?.chain().focus().insertReaction().run(),
        isActive: Boolean(editor?.isActive('reaction'))
      },
      {
        label: 'Link',
        onClick: () => {
          if (!editor) {
            return;
          }

          const currentHref = String(editor.getAttributes('link').href ?? '');
          const nextHref = window.prompt('Enter URL (leave empty to remove link)', currentHref || 'https://');
          if (nextHref === null) {
            return;
          }

          const trimmedHref = nextHref.trim();
          if (!trimmedHref) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }

          editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedHref }).run();
        },
        isActive: Boolean(editor?.isActive('link'))
      },
      {
        label: 'Formula',
        onClick: () => {
          if (!editor) {
            return;
          }

          const { from, to } = editor.state.selection;
          const selectedText = editor.state.doc.textBetween(from, to, ' ');
          const latex = sanitizeLatex(selectedText);
          editor.chain().focus().insertContent({ type: 'inlineMath', attrs: { latex } }).run();
        },
        isActive: Boolean(editor?.isActive('inlineMath') || editor?.isActive('blockMath'))
      }
    ],
    [editor]
  );

  const setActiveSelection = (active: NotebookActiveState) => {
    setDb((previous) => (previous ? { ...previous, active } : previous));
  };

  const handleExperimentSelect = (group: NotebookGroup, project: NotebookProject, experiment: NotebookExperiment) => {
    setCollapsedGroups((previous) => ({ ...previous, [group.id]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [project.id]: false }));
    setActiveSelection({
      groupId: group.id,
      projectId: project.id,
      experimentId: experiment.id
    });
  };

  const handleDocumentChange = (content: JSONContent) => {
    setDb((previous) => {
      if (!previous) {
        return previous;
      }

      if (previous.active.experimentId) {
        const experimentId = previous.active.experimentId;
        const experiments = previous.experiments.map((experiment) => {
          if (experiment.id !== experimentId) {
            return experiment;
          }

          const title = extractDocumentTitle(content, experiment.title || getDefaultTitle('experiment'));
          setPendingSave({ id: experiment.id, title, content });
          return { ...experiment, content, title };
        });

        return { ...previous, experiments };
      }

      if (previous.active.projectId) {
        const projectId = previous.active.projectId;
        const projects = previous.projects.map((project) => {
          if (project.id !== projectId) {
            return project;
          }

          const name = extractDocumentTitle(content, project.name || getDefaultTitle('project'));
          setPendingSave({ id: project.id, title: name, content });
          return { ...project, content, name };
        });

        return { ...previous, projects };
      }

      if (previous.active.groupId) {
        const groupId = previous.active.groupId;
        const groups = previous.groups.map((group) => {
          if (group.id !== groupId) {
            return group;
          }

          const name = extractDocumentTitle(content, group.name || getDefaultTitle('group'));
          setPendingSave({ id: group.id, title: name, content });
          return { ...group, content, name };
        });

        return { ...previous, groups };
      }

      return previous;
    });
  };

  const handleNewGroup = async () => {
    if (!db) {
      return;
    }

    const title = `Group ${db.groups.length + 1}`;
    const document = await createNotebookDocument('group', null, title, createTemplateDocument('group', title));
    setCollapsedGroups((previous) => ({ ...previous, [document.id]: false }));
    await reloadDb({ groupId: document.id, projectId: null, experimentId: null });
  };

  const handleGroupSelect = (groupId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setActiveSelection({ groupId, projectId: null, experimentId: null });
  };

  const handleProjectSelect = (groupId: string, projectId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));
    setActiveSelection({ groupId, projectId, experimentId: null });
  };

  const handleNewProject = async () => {
    if (!db?.active.groupId) {
      return;
    }

    const siblingCount = db.projects.filter((project) => project.groupId === db.active.groupId).length;
    const title = `Project ${siblingCount + 1}`;
    const document = await createNotebookDocument('project', db.active.groupId, title, createTemplateDocument('project', title));
    setCollapsedGroups((previous) => ({ ...previous, [db.active.groupId!]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [document.id]: false }));
    await reloadDb({ groupId: db.active.groupId, projectId: document.id, experimentId: null });
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((previous) => ({
      ...previous,
      [groupId]: !previous[groupId]
    }));
  };

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((previous) => ({
      ...previous,
      [projectId]: !previous[projectId]
    }));
  };

  const handleNewExperiment = async (templateId?: string) => {
    if (!db?.active.projectId) {
      return;
    }

    const siblingCount = db.experiments.filter((experiment) => experiment.projectId === db.active.projectId).length;
    const title = siblingCount === 0 ? 'Untitled Experiment' : `Untitled Experiment ${siblingCount + 1}`;
    const content = templateId ? withDocumentTitle((await fetchTemplate(templateId)).content, title) : createBlankDocument(title);
    const document = await createNotebookDocument('experiment', db.active.projectId, title, content);
    await reloadDb({
      groupId: db.active.groupId,
      projectId: db.active.projectId,
      experimentId: document.id
    });
  };

  const handleSaveAsTemplate = async () => {
    if (!selectedDocument || selectedDocument.kind !== 'experiment') {
      return;
    }

    const name = window.prompt('Template name', selectedDocument.title);
    if (!name?.trim()) {
      return;
    }

    await createTemplateFromDocument(name.trim(), selectedDocument.id);
    await reloadTemplates();
  };

  const handleDeleteTemplate = async (template: BackendTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) {
      return;
    }
    await deleteTemplate(template.id);
    await reloadTemplates();
  };

  const selectedExperiment =
    selectedDocument?.kind === 'experiment' ? db?.experiments.find((item) => item.id === selectedDocument.id) ?? null : null;

  const handleMetadataChange = async (metadata: DocumentMetadata) => {
    if (!selectedExperiment) {
      return;
    }

    // Optimistic local update; the server normalises and the next reload confirms.
    setDb((previous) =>
      previous
        ? {
            ...previous,
            experiments: previous.experiments.map((item) => (item.id === selectedExperiment.id ? { ...item, metadata } : item))
          }
        : previous
    );

    try {
      await updateDocumentMetadata(selectedExperiment.id, metadata);
    } catch {
      setSaveState('error');
    }
  };

  const handleDeleteSelectedDocument = async () => {
    if (!selectedDocument) {
      return;
    }

    const label = selectedDocument.kind === 'experiment' ? 'experiment' : selectedDocument.kind;
    const confirmed = window.confirm(`Delete this ${label}?`);
    if (!confirmed) {
      return;
    }

    await deleteNotebookDocument(selectedDocument.id);
    setPendingSave((current) => (current?.id === selectedDocument.id ? null : current));
    await reloadDb();
  };

  // Jump to a document by id (from registry backlinks); switches back to the notebook view.
  const openDocumentById = (documentId: string) => {
    if (!db) {
      return;
    }

    const experiment = db.experiments.find((item) => item.id === documentId);
    const project = experiment
      ? db.projects.find((item) => item.id === experiment.projectId)
      : db.projects.find((item) => item.id === documentId);
    const group = db.groups.find((item) => item.id === (project?.groupId ?? documentId));

    if (!group) {
      return;
    }

    setCollapsedGroups((previous) => ({ ...previous, [group.id]: false }));
    if (project) {
      setCollapsedProjects((previous) => ({ ...previous, [project.id]: false }));
    }

    setActiveSelection({
      groupId: group.id,
      projectId: project?.id ?? null,
      experimentId: experiment?.id ?? null
    });
    setView('notebook');
  };

  const handleDocumentRestored = async () => {
    if (!selectedDocument) {
      return;
    }

    setPendingSave((current) => (current?.id === selectedDocument.id ? null : current));
    await reloadDb(db?.active ?? null);
    setEditorEpoch((previous) => previous + 1);
  };

  if (isLoading && !db) {
    return (
      <main className="page">
        <div className="shell status-panel">Loading notebook data...</div>
      </main>
    );
  }

  if (loadError && !db) {
    return (
      <main className="page">
        <div className="shell status-panel">
          <p>Failed to load notebook data.</p>
          <p>{loadError}</p>
          <button type="button" onClick={() => void reloadDb()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!db) {
    return null;
  }

  return (
    <main className="page">
      <div className="shell app-layout">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button type="button" onClick={() => void handleNewGroup()}>
              New Group
            </button>
            <button type="button" onClick={() => void handleNewProject()} disabled={!db.active.groupId}>
              New Project
            </button>
            <button type="button" onClick={() => void handleNewExperiment()} disabled={!db.active.projectId}>
              New Experiment
            </button>
            {templates.length > 0 && (
              <div className="template-picker">
                <select
                  aria-label="New experiment from template"
                  value=""
                  disabled={!db.active.projectId}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith('delete:')) {
                      const template = templates.find((item) => item.id === value.slice('delete:'.length));
                      if (template) {
                        void handleDeleteTemplate(template);
                      }
                    } else if (value) {
                      void handleNewExperiment(value);
                    }
                  }}
                >
                  <option value="">New from template…</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                  <option disabled>──────────</option>
                  {templates.map((template) => (
                    <option key={`delete:${template.id}`} value={`delete:${template.id}`}>
                      Delete “{template.name}”
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className={view === 'entities' ? 'is-active' : ''}
              onClick={() => setView((current) => (current === 'entities' ? 'notebook' : 'entities'))}
            >
              {view === 'entities' ? 'Back to notebook' : 'Entities'}
            </button>
          </div>

          <div className="tree">
            {db.groups.map((group) => {
              const groupProjects = db.projects.filter((project) => project.groupId === group.id);
              const isGroupSelected = db.active.groupId === group.id;
              const isGroupExpanded = !collapsedGroups[group.id];

              return (
                <div key={group.id} className="tree-group">
                  <div className="tree-row">
                    <button
                      type="button"
                      className="tree-toggle"
                      aria-label={isGroupExpanded ? 'Collapse group' : 'Expand group'}
                      onClick={() => toggleGroupCollapsed(group.id)}
                    >
                      {isGroupExpanded ? '▾' : '▸'}
                    </button>
                    <button
                      type="button"
                      className={`tree-item tree-group-item${isGroupSelected ? ' is-active' : ''}`}
                      onClick={() => handleGroupSelect(group.id)}
                    >
                      {group.name}
                    </button>
                  </div>

                  {isGroupExpanded && (
                    <div className="tree-projects">
                      {groupProjects.map((project) => {
                        const projectExperiments = db.experiments.filter((experiment) => experiment.projectId === project.id);
                        const isProjectSelected = db.active.projectId === project.id;
                        const isProjectExpanded = !collapsedProjects[project.id];

                        return (
                          <div key={project.id} className="tree-project">
                            <div className="tree-row">
                              <button
                                type="button"
                                className="tree-toggle"
                                aria-label={isProjectExpanded ? 'Collapse project' : 'Expand project'}
                                onClick={() => toggleProjectCollapsed(project.id)}
                              >
                                {isProjectExpanded ? '▾' : '▸'}
                              </button>
                              <button
                                type="button"
                                className={`tree-item tree-project-item${isProjectSelected ? ' is-active' : ''}`}
                                onClick={() => handleProjectSelect(group.id, project.id)}
                              >
                                {project.name}
                              </button>
                            </div>

                            {isProjectExpanded && (
                              <div className="tree-experiments">
                                {projectExperiments.map((experiment) => (
                                  <button
                                    key={experiment.id}
                                    type="button"
                                    className={`tree-item tree-experiment-item${
                                      db.active.experimentId === experiment.id ? ' is-active' : ''
                                    }`}
                                    onClick={() => handleExperimentSelect(group, project, experiment)}
                                  >
                                    {experiment.metadata.status && (
                                      <span
                                        className={`status-dot status-${experiment.metadata.status}`}
                                        title={STATUS_LABELS[experiment.metadata.status]}
                                      />
                                    )}
                                    {experiment.title}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="main-panel">
          {view === 'entities' ? (
            <EntityRegistry onOpenDocument={openDocumentById} />
          ) : (
            <>
              <div className="toolbar">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.isActive ? 'is-active' : ''}
                    onClick={action.onClick}
                    disabled={!editor || !selectedDocument}
                  >
                    {action.label}
                  </button>
                ))}
                <span className="toolbar-status" aria-live="polite">
                  {saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Save failed' : 'Connected'}
                </span>
              </div>
    
              {loadError && <div className="status-inline">{loadError}</div>}

              {selectedExperiment && (
                <ExperimentMeta
                  key={selectedExperiment.id}
                  metadata={selectedExperiment.metadata}
                  createdAt={selectedExperiment.createdAt}
                  onChange={(metadata) => void handleMetadataChange(metadata)}
                />
              )}
    
              <NotebookEditor
                key={selectedDocument ? `${selectedDocument.kind}-${selectedDocument.id}-${editorEpoch}` : 'no-document'}
                documentId={selectedDocument?.id ?? null}
                initialContent={selectedDocument?.content ?? createBlankDocument()}
                editable={Boolean(selectedDocument)}
                documentKind={selectedDocument?.kind ?? 'experiment'}
                onEditorReady={setEditor}
                onDocumentChange={handleDocumentChange}
                onDeleteDocument={() => void handleDeleteSelectedDocument()}
                onSaveAsTemplate={selectedDocument?.kind === 'experiment' ? () => void handleSaveAsTemplate() : null}
                onDocumentRestored={() => void handleDocumentRestored()}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
