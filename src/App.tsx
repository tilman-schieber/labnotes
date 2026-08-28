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
import SearchResults from './sidebar/SearchResults';
import AttachmentsPanel from './editor/AttachmentsPanel';
import LinkedEntities from './editor/LinkedEntities';
import RevisionHistory from './editor/RevisionHistory';
import {
  IconAtom,
  IconBeaker,
  IconBold,
  IconBook,
  IconChevron,
  IconFlask,
  IconFolder,
  IconHeading,
  IconItalic,
  IconLayers,
  IconLink,
  IconList,
  IconPdf,
  IconPlus,
  IconSearch,
  IconSigma,
  IconTable,
  IconTasks,
  IconTemplate,
  IconTrash,
  IconX
} from './ui/icons';
import { attachmentUrl, type BackendAttachment } from './api/backend';
import { confirmDialog, promptDialog } from './ui/dialogs';
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
  const [searchText, setSearchText] = useState('');
  const [attachmentsToken, setAttachmentsToken] = useState(0);
  // Counts completed saves so panels driven by the server-side mention index can refresh.
  const [saveCount, setSaveCount] = useState(0);
  const [registryEntityId, setRegistryEntityId] = useState<string | null>(null);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  const openEntityInRegistry = (entityId: string) => {
    setRegistryEntityId(entityId);
    setView('entities');
  };

  const insertImage = (attachment: BackendAttachment) => {
    editor?.chain().focus().setImage({ src: attachmentUrl(attachment.id), alt: attachment.filename }).run();
  };

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
          setSaveCount((previous) => previous + 1);
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
        icon: <IconBold />,
        group: 'text',
        onClick: () => editor?.chain().focus().toggleBold().run(),
        isActive: Boolean(editor?.isActive('bold'))
      },
      {
        label: 'Italic',
        icon: <IconItalic />,
        group: 'text',
        onClick: () => editor?.chain().focus().toggleItalic().run(),
        isActive: Boolean(editor?.isActive('italic'))
      },
      {
        label: 'Heading',
        icon: <IconHeading />,
        group: 'blocks',
        onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        isActive: Boolean(editor?.isActive('heading', { level: 2 }))
      },
      {
        label: 'Bullet list',
        icon: <IconList />,
        group: 'blocks',
        onClick: () => editor?.chain().focus().toggleBulletList().run(),
        isActive: Boolean(editor?.isActive('bulletList'))
      },
      {
        label: 'Task list',
        icon: <IconTasks />,
        group: 'blocks',
        onClick: () => editor?.chain().focus().toggleTaskList().run(),
        isActive: Boolean(editor?.isActive('taskList'))
      },
      {
        label: 'Table',
        icon: <IconTable />,
        group: 'blocks',
        onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        isActive: false
      },
      {
        label: 'Reaction',
        icon: <IconFlask />,
        group: 'insert',
        wide: true,
        onClick: () => editor?.chain().focus().insertReaction().run(),
        isActive: Boolean(editor?.isActive('reaction'))
      },
      {
        label: 'Link',
        icon: <IconLink />,
        group: 'insert',
        onClick: () => {
          if (!editor) {
            return;
          }

          const currentHref = String(editor.getAttributes('link').href ?? '');
          void promptDialog({
            title: currentHref ? 'Edit link' : 'Add link',
            label: 'URL',
            placeholder: 'https://…',
            defaultValue: currentHref,
            confirmLabel: currentHref ? 'Update' : 'Add link',
            message: currentHref ? 'Leave the URL empty to remove the link.' : undefined
          }).then((nextHref) => {
            if (nextHref === null) {
              return;
            }

            const trimmedHref = nextHref.trim();
            if (!trimmedHref) {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              return;
            }

            editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedHref }).run();
          });
        },
        isActive: Boolean(editor?.isActive('link'))
      },
      {
        label: 'Formula',
        icon: <IconSigma />,
        group: 'insert',
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

    const name = await promptDialog({
      title: 'Save as template',
      message: 'The current content becomes a reusable starting point for new experiments.',
      label: 'Template name',
      defaultValue: selectedDocument.title,
      confirmLabel: 'Save template',
      validate: (value) => (value.trim() ? null : 'Give the template a name')
    });
    if (!name?.trim()) {
      return;
    }

    await createTemplateFromDocument(name.trim(), selectedDocument.id);
    await reloadTemplates();
  };

  const handleDeleteTemplate = async (template: BackendTemplate) => {
    const confirmed = await confirmDialog({
      title: `Delete template “${template.name}”?`,
      message: 'Experiments already created from it are not affected.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!confirmed) {
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

    const label = selectedDocument.kind;
    const confirmed = await confirmDialog({
      title: `Delete this ${label}?`,
      message:
        label === 'experiment'
          ? `“${selectedDocument.title}” and its revision history and attachments will be removed.`
          : `“${selectedDocument.title}” and everything inside it will be removed.`,
      confirmLabel: 'Delete',
      danger: true
    });
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
    return <div className="status-panel">Loading notebook…</div>;
  }

  if (loadError && !db) {
    return (
      <div className="status-panel">
        <p>Failed to load notebook data.</p>
        <p className="muted">{loadError}</p>
        <button type="button" className="btn" onClick={() => void reloadDb()}>
          Retry
        </button>
      </div>
    );
  }

  if (!db) {
    return null;
  }

  // Group › Project path shown above the document (the document's own title lives in the editor).
  const crumbs = (() => {
    if (!selectedDocument) {
      return [];
    }
    const project = selectedExperiment
      ? db.projects.find((item) => item.id === selectedExperiment.projectId) ?? null
      : selectedDocument.kind === 'project'
        ? db.projects.find((item) => item.id === selectedDocument.id) ?? null
        : null;
    const group = db.groups.find((item) => item.id === (project?.groupId ?? selectedDocument.id)) ?? null;
    const parts: string[] = [];
    if (group && selectedDocument.kind !== 'group') {
      parts.push(group.name);
    }
    if (project && selectedDocument.kind === 'experiment') {
      parts.push(project.name);
    }
    return parts;
  })();

  const recognizedCount = Number(editor?.storage.recognition?.count ?? 0);

  const toolbar = (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {['text', 'blocks', 'insert'].map((group) => (
        <span key={group} className="toolbar-group">
          {actions
            .filter((action) => action.group === group)
            .map((action) => (
              <button
                key={action.label}
                type="button"
                className={`${action.isActive ? 'is-active' : ''}${action.wide ? ' toolbar-wide' : ''}`}
                onClick={action.onClick}
                disabled={!editor || !selectedDocument}
                title={action.label}
                aria-label={action.label}
              >
                {action.icon}
                {action.wide && <span>{action.label}</span>}
              </button>
            ))}
        </span>
      ))}
      {recognizedCount > 0 && (
        <button
          type="button"
          className="toolbar-wide toolbar-hint-action"
          onClick={() => editor?.chain().focus().linkAllRecognized().run()}
          title="Turn every underlined known name into a reference"
        >
          <IconAtom />
          <span>
            Link {recognizedCount} known {recognizedCount === 1 ? 'name' : 'names'}
          </span>
        </button>
      )}
    </div>
  );

  const saveStatusClass = saveState === 'saving' ? ' is-saving' : saveState === 'error' ? ' is-error' : '';
  const saveStatusLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved';

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <IconBook size={16} />
          </span>
          Labnotes
        </div>

        <div className="header-center">
          <div className="segmented" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === 'notebook'} className={view === 'notebook' ? 'is-active' : ''} onClick={() => setView('notebook')}>
              <IconBeaker size={14} />
              Notebook
            </button>
            <button type="button" role="tab" aria-selected={view === 'entities'} className={view === 'entities' ? 'is-active' : ''} onClick={() => setView('entities')}>
              <IconAtom size={14} />
              Entities
            </button>
          </div>

          <div className="global-search">
            <IconSearch size={14} />
            <input
              type="search"
              placeholder="Search notebook…  (#tag for tags)"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              aria-label="Search notebook"
            />
          </div>
        </div>

        <div className={`save-status${saveStatusClass}`} aria-live="polite">
          <span className="save-status-dot" />
          {saveStatusLabel}
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <span>Notebook</span>
            <div className="new-menu">
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                aria-label="Create…"
                aria-haspopup="menu"
                aria-expanded={isNewMenuOpen}
                title="Create group, project or experiment"
                onClick={() => setIsNewMenuOpen((open) => !open)}
              >
                <IconPlus size={16} />
              </button>
              {isNewMenuOpen && <div className="menu-backdrop" onClick={() => setIsNewMenuOpen(false)} />}
              {isNewMenuOpen && (
                <div className="new-menu-panel" role="menu">
                  <button
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIsNewMenuOpen(false);
                      void handleNewGroup();
                    }}
                  >
                    <IconFolder size={14} />
                    New group
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    disabled={!db.active.groupId}
                    onClick={() => {
                      setIsNewMenuOpen(false);
                      void handleNewProject();
                    }}
                  >
                    <IconLayers size={14} />
                    New project
                    <span className="menu-item-hint">in group</span>
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    role="menuitem"
                    disabled={!db.active.projectId}
                    onClick={() => {
                      setIsNewMenuOpen(false);
                      void handleNewExperiment();
                    }}
                  >
                    <IconBeaker size={14} />
                    New experiment
                    <span className="menu-item-hint">in project</span>
                  </button>
                  {templates.length > 0 && (
                    <>
                      <div className="menu-section">From template</div>
                      {templates.map((template) => (
                        <div key={template.id} className="menu-row">
                          <button
                            type="button"
                            className="menu-item"
                            role="menuitem"
                            disabled={!db.active.projectId}
                            onClick={() => {
                              setIsNewMenuOpen(false);
                              void handleNewExperiment(template.id);
                            }}
                          >
                            <IconTemplate size={14} />
                            {template.name}
                          </button>
                          <button
                            type="button"
                            className="menu-delete"
                            aria-label={`Delete template ${template.name}`}
                            title="Delete template"
                            onClick={() => void handleDeleteTemplate(template)}
                          >
                            <IconX size={12} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {searchText.trim() ? (
            <SearchResults
              queryText={searchText.trim()}
              onOpenDocument={(id) => {
                openDocumentById(id);
                setSearchText('');
              }}
            />
          ) : (
            <div className="tree">
              {db.groups.length === 0 && <div className="tree-empty">No groups yet — create one with +.</div>}
              {db.groups.map((group) => {
                const groupProjects = db.projects.filter((project) => project.groupId === group.id);
                const isGroupSelected = db.active.groupId === group.id && !db.active.projectId;
                const isGroupExpanded = !collapsedGroups[group.id];

                return (
                  <div key={group.id} className="tree-group">
                    <div className="tree-row">
                      <button
                        type="button"
                        className={`tree-toggle${isGroupExpanded ? ' is-open' : ''}`}
                        aria-label={isGroupExpanded ? 'Collapse group' : 'Expand group'}
                        onClick={() => toggleGroupCollapsed(group.id)}
                      >
                        <IconChevron size={14} />
                      </button>
                      <button
                        type="button"
                        className={`tree-item tree-group-item${isGroupSelected ? ' is-active' : ''}`}
                        onClick={() => handleGroupSelect(group.id)}
                      >
                        <IconFolder size={14} />
                        <span className="tree-label">{group.name}</span>
                      </button>
                    </div>

                    {isGroupExpanded && (
                      <div className="tree-projects">
                        {groupProjects.map((project) => {
                          const projectExperiments = db.experiments.filter((experiment) => experiment.projectId === project.id);
                          const isProjectSelected = db.active.projectId === project.id && !db.active.experimentId;
                          const isProjectExpanded = !collapsedProjects[project.id];

                          return (
                            <div key={project.id} className="tree-project">
                              <div className="tree-row">
                                <button
                                  type="button"
                                  className={`tree-toggle${isProjectExpanded ? ' is-open' : ''}`}
                                  aria-label={isProjectExpanded ? 'Collapse project' : 'Expand project'}
                                  onClick={() => toggleProjectCollapsed(project.id)}
                                >
                                  <IconChevron size={14} />
                                </button>
                                <button
                                  type="button"
                                  className={`tree-item tree-project-item${isProjectSelected ? ' is-active' : ''}`}
                                  onClick={() => handleProjectSelect(group.id, project.id)}
                                >
                                  <IconLayers size={14} />
                                  <span className="tree-label">{project.name}</span>
                                </button>
                              </div>

                              {isProjectExpanded && (
                                <div className="tree-experiments">
                                  {projectExperiments.length === 0 && <div className="tree-empty">No experiments</div>}
                                  {projectExperiments.map((experiment) => (
                                    <button
                                      key={experiment.id}
                                      type="button"
                                      className={`tree-item tree-experiment-item${db.active.experimentId === experiment.id ? ' is-active' : ''}`}
                                      onClick={() => handleExperimentSelect(group, project, experiment)}
                                    >
                                      <IconBeaker size={14} />
                                      <span className="tree-label">{experiment.title}</span>
                                      {experiment.metadata.status && (
                                        <span className={`status-dot status-${experiment.metadata.status}`} title={STATUS_LABELS[experiment.metadata.status]} />
                                      )}
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
          )}
        </aside>

        <main className="main">
          <div className="main-inner">
            {view === 'entities' ? (
              <EntityRegistry onOpenDocument={openDocumentById} initialSelectedId={registryEntityId} />
            ) : selectedDocument ? (
              <>
                <div className="doc-header">
                  <div className="doc-crumbs">
                    <span className={`badge kind-badge kind-${selectedDocument.kind}`}>{selectedDocument.kind}</span>
                    {crumbs.map((crumb, index) => (
                      <span key={`${crumb}-${index}`}>
                        {index > 0 && <span className="crumb-sep">› </span>}
                        {crumb}
                      </span>
                    ))}
                  </div>
                  <div className="doc-actions">
                    <RevisionHistory documentId={selectedDocument.id} onRestored={() => void handleDocumentRestored()} />
                    {selectedDocument.kind === 'experiment' && (
                      <button type="button" className="btn btn-sm" onClick={() => void handleSaveAsTemplate()} title="Save this experiment as a template">
                        <IconTemplate size={14} />
                        Template
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => window.open(`/api/documents/${selectedDocument.id}/export.pdf`, '_blank', 'noopener')}
                      title="Export as PDF (Typst)"
                    >
                      <IconPdf size={14} />
                      PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-icon btn-danger"
                      onClick={() => void handleDeleteSelectedDocument()}
                      title="Delete document"
                      aria-label="Delete document"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                {loadError && <div className="status-inline">{loadError}</div>}

                {selectedExperiment && (
                  <ExperimentMeta
                    key={`meta-${selectedExperiment.id}`}
                    metadata={selectedExperiment.metadata}
                    createdAt={selectedExperiment.createdAt}
                    onChange={(metadata) => void handleMetadataChange(metadata)}
                  />
                )}

                <NotebookEditor
                  key={`${selectedDocument.kind}-${selectedDocument.id}-${editorEpoch}`}
                  documentId={selectedDocument.id}
                  initialContent={selectedDocument.content}
                  editable
                  documentKind={selectedDocument.kind}
                  onEditorReady={setEditor}
                  onDocumentChange={handleDocumentChange}
                  onAttachmentUploaded={() => setAttachmentsToken((previous) => previous + 1)}
                  toolbar={toolbar}
                />

                <div className="doc-footer">
                  <AttachmentsPanel
                    key={`attachments-${selectedDocument.id}`}
                    documentId={selectedDocument.id}
                    onInsertImage={insertImage}
                    refreshToken={attachmentsToken}
                  />
                  <LinkedEntities
                    key={`linked-${selectedDocument.id}`}
                    documentId={selectedDocument.id}
                    refreshToken={saveCount}
                    onOpenEntity={openEntityInRegistry}
                    onOpenDocument={openDocumentById}
                  />
                </div>
              </>
            ) : (
              <div className="empty-state">
                <IconBeaker size={40} />
                <h2>Nothing selected</h2>
                <p>Pick an experiment in the sidebar, or create one with the + button.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
