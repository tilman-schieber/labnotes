import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import NotebookEditor from './editor/Editor';
import { type NotebookDocumentKind, createTemplateDocument, extractDocumentTitle, getDefaultTitle } from './documents/templates';
import { sanitizeLatex } from './editor/extensions/Math';
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
  type NotebookProtocol
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

    if (db.active.protocolId) {
      const protocol = db.protocols.find((item) => item.id === db.active.protocolId) ?? null;
      if (!protocol) {
        return null;
      }

      return {
        kind: 'protocol',
        id: protocol.id,
        title: protocol.title,
        content: protocol.content
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
        label: 'Insert table',
        onClick: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        isActive: false
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

  const handleProtocolSelect = (group: NotebookGroup, project: NotebookProject, protocol: NotebookProtocol) => {
    setCollapsedGroups((previous) => ({ ...previous, [group.id]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [project.id]: false }));
    setActiveSelection({
      groupId: group.id,
      projectId: project.id,
      protocolId: protocol.id
    });
  };

  const handleDocumentChange = (content: JSONContent) => {
    setDb((previous) => {
      if (!previous) {
        return previous;
      }

      if (previous.active.protocolId) {
        const protocolId = previous.active.protocolId;
        const protocols = previous.protocols.map((protocol) => {
          if (protocol.id !== protocolId) {
            return protocol;
          }

          const title = extractDocumentTitle(content, protocol.title || getDefaultTitle('protocol'));
          setPendingSave({ id: protocol.id, title, content });
          return { ...protocol, content, title };
        });

        return { ...previous, protocols };
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
    await reloadDb({ groupId: document.id, projectId: null, protocolId: null });
  };

  const handleGroupSelect = (groupId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setActiveSelection({ groupId, projectId: null, protocolId: null });
  };

  const handleProjectSelect = (groupId: string, projectId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));
    setActiveSelection({ groupId, projectId, protocolId: null });
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
    await reloadDb({ groupId: db.active.groupId, projectId: document.id, protocolId: null });
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

  const handleNewProtocol = async () => {
    if (!db?.active.projectId) {
      return;
    }

    const siblingCount = db.protocols.filter((protocol) => protocol.projectId === db.active.projectId).length;
    const title = siblingCount === 0 ? 'Untitled Protocol' : `Untitled Protocol ${siblingCount + 1}`;
    const document = await createNotebookDocument('protocol', db.active.projectId, title, createBlankDocument(title));
    await reloadDb({
      groupId: db.active.groupId,
      projectId: db.active.projectId,
      protocolId: document.id
    });
  };

  const handleDeleteSelectedDocument = async () => {
    if (!selectedDocument) {
      return;
    }

    const label = selectedDocument.kind === 'protocol' ? 'protocol' : selectedDocument.kind;
    const confirmed = window.confirm(`Delete this ${label}?`);
    if (!confirmed) {
      return;
    }

    await deleteNotebookDocument(selectedDocument.id);
    setPendingSave((current) => (current?.id === selectedDocument.id ? null : current));
    await reloadDb();
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
            <button type="button" onClick={() => void handleNewProtocol()} disabled={!db.active.projectId}>
              New Protocol
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
                        const projectProtocols = db.protocols.filter((protocol) => protocol.projectId === project.id);
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
                              <div className="tree-protocols">
                                {projectProtocols.map((protocol) => (
                                  <button
                                    key={protocol.id}
                                    type="button"
                                    className={`tree-item tree-protocol-item${
                                      db.active.protocolId === protocol.id ? ' is-active' : ''
                                    }`}
                                    onClick={() => handleProtocolSelect(group, project, protocol)}
                                  >
                                    {protocol.title}
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

          <NotebookEditor
            key={selectedDocument ? `${selectedDocument.kind}-${selectedDocument.id}` : 'no-document'}
            initialContent={selectedDocument?.content ?? createBlankDocument()}
            editable={Boolean(selectedDocument)}
            documentKind={selectedDocument?.kind ?? 'protocol'}
            onEditorReady={setEditor}
            onDocumentChange={handleDocumentChange}
            onDeleteDocument={() => void handleDeleteSelectedDocument()}
          />
        </section>
      </div>
    </main>
  );
}
