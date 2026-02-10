import { useEffect, useMemo, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import NotebookEditor from './editor/Editor';
import { type NotebookDocumentKind, createTemplateDocument, extractDocumentTitle, getDefaultTitle } from './documents/templates';
import { sanitizeLatex } from './editor/extensions/Math';
import {
  createBlankDocument,
  loadNotebookDb,
  saveNotebookDb,
  type NotebookDB,
  type NotebookGroup,
  type NotebookProject,
  type NotebookProtocol
} from './storage/documentStore';

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [db, setDb] = useState<NotebookDB>(() => loadNotebookDb());
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    saveNotebookDb(db);
  }, [db]);

  const selectedDocument = useMemo(() => {
    if (db.active.protocolId) {
      const protocol = db.protocols.find((item) => item.id === db.active.protocolId) ?? null;
      if (!protocol) {
        return null;
      }

      return {
        kind: 'protocol' as NotebookDocumentKind,
        id: protocol.id,
        content: protocol.content
      };
    }

    if (db.active.projectId) {
      const project = db.projects.find((item) => item.id === db.active.projectId) ?? null;
      if (!project) {
        return null;
      }

      return {
        kind: 'project' as NotebookDocumentKind,
        id: project.id,
        content: project.content
      };
    }

    if (db.active.groupId) {
      const group = db.groups.find((item) => item.id === db.active.groupId) ?? null;
      if (!group) {
        return null;
      }

      return {
        kind: 'group' as NotebookDocumentKind,
        id: group.id,
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

  const handleProtocolSelect = (group: NotebookGroup, project: NotebookProject, protocol: NotebookProtocol) => {
    setCollapsedGroups((previous) => ({ ...previous, [group.id]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [project.id]: false }));

    setDb((previous) => ({
      ...previous,
      active: {
        groupId: group.id,
        projectId: project.id,
        protocolId: protocol.id
      }
    }));
  };

  const handleProtocolChange = (content: JSONContent) => {
    setDb((previous) => {
      if (previous.active.protocolId) {
        const protocolId = previous.active.protocolId;
        return {
          ...previous,
          protocols: previous.protocols.map((protocol) => {
            if (protocol.id !== protocolId) {
              return protocol;
            }

            const title = extractDocumentTitle(content, protocol.title || getDefaultTitle('protocol'));
            return { ...protocol, content, title };
          })
        };
      }

      if (previous.active.projectId) {
        const projectId = previous.active.projectId;
        return {
          ...previous,
          projects: previous.projects.map((project) => {
            if (project.id !== projectId) {
              return project;
            }

            const name = extractDocumentTitle(content, project.name || getDefaultTitle('project'));
            return { ...project, content, name };
          })
        };
      }

      if (previous.active.groupId) {
        const groupId = previous.active.groupId;
        return {
          ...previous,
          groups: previous.groups.map((group) => {
            if (group.id !== groupId) {
              return group;
            }

            const name = extractDocumentTitle(content, group.name || getDefaultTitle('group'));
            return { ...group, content, name };
          })
        };
      }

      return previous;
    });
  };

  const handleNewGroup = () => {
    const newGroup: NotebookGroup = {
      id: createId('group'),
      name: `Group ${db.groups.length + 1}`,
      content: createTemplateDocument('group', `Group ${db.groups.length + 1}`)
    };

    setDb((previous) => ({
      ...previous,
      groups: [...previous.groups, newGroup],
      active: {
        groupId: newGroup.id,
        projectId: null,
        protocolId: null
      }
    }));

    setCollapsedGroups((previous) => ({ ...previous, [newGroup.id]: false }));
  };

  const handleGroupSelect = (groupId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));

    setDb((previous) => ({
      ...previous,
      active: {
        groupId,
        projectId: null,
        protocolId: null
      }
    }));
  };

  const handleProjectSelect = (groupId: string, projectId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));

    setDb((previous) => ({
      ...previous,
      active: {
        groupId,
        projectId,
        protocolId: null
      }
    }));
  };

  const handleNewProject = () => {
    if (!db.active.groupId) {
      return;
    }

    const newProject: NotebookProject = {
      id: createId('project'),
      groupId: db.active.groupId,
      name: `Project ${db.projects.filter((project) => project.groupId === db.active.groupId).length + 1}`,
      content: createTemplateDocument(
        'project',
        `Project ${db.projects.filter((project) => project.groupId === db.active.groupId).length + 1}`
      )
    };

    setDb((previous) => ({
      ...previous,
      projects: [...previous.projects, newProject],
      active: {
        groupId: newProject.groupId,
        projectId: newProject.id,
        protocolId: null
      }
    }));

    setCollapsedGroups((previous) => ({ ...previous, [newProject.groupId]: false }));
    setCollapsedProjects((previous) => ({ ...previous, [newProject.id]: false }));
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

  const handleNewProtocol = () => {
    if (!db.active.groupId || !db.active.projectId) {
      return;
    }

    const siblingCount = db.protocols.filter((protocol) => protocol.projectId === db.active.projectId).length;

    const newProtocol: NotebookProtocol = {
      id: createId('protocol'),
      groupId: db.active.groupId,
      projectId: db.active.projectId,
      title: siblingCount === 0 ? 'Untitled Protocol' : `Untitled Protocol ${siblingCount + 1}`,
      content: createBlankDocument(siblingCount === 0 ? 'Untitled Protocol' : `Untitled Protocol ${siblingCount + 1}`)
    };

    setDb((previous) => ({
      ...previous,
      protocols: [...previous.protocols, newProtocol],
      active: {
        groupId: newProtocol.groupId,
        projectId: newProtocol.projectId,
        protocolId: newProtocol.id
      }
    }));
  };

  const handleDeleteSelectedDocument = () => {
    if (!selectedDocument) {
      return;
    }

    const label = selectedDocument.kind === 'protocol' ? 'protocol' : selectedDocument.kind;
    const confirmed = window.confirm(`Delete this ${label}?`);
    if (!confirmed) {
      return;
    }

    if (selectedDocument.kind === 'protocol') {
      const protocolId = selectedDocument.id;
      setDb((previous) => {
        const target = previous.protocols.find((item) => item.id === protocolId);
        if (!target) {
          return previous;
        }

        const protocols = previous.protocols.filter((item) => item.id !== protocolId);
        const sibling = protocols.find((item) => item.projectId === target.projectId && item.groupId === target.groupId) ?? null;

        return {
          ...previous,
          protocols,
          active: {
            groupId: target.groupId,
            projectId: target.projectId,
            protocolId: sibling?.id ?? null
          }
        };
      });

      return;
    }

    if (selectedDocument.kind === 'project') {
      const projectId = selectedDocument.id;
      setCollapsedProjects((previous) => {
        const next = { ...previous };
        delete next[projectId];
        return next;
      });

      setDb((previous) => {
        const target = previous.projects.find((item) => item.id === projectId);
        if (!target) {
          return previous;
        }

        return {
          ...previous,
          projects: previous.projects.filter((item) => item.id !== projectId),
          protocols: previous.protocols.filter((item) => item.projectId !== projectId),
          active: {
            groupId: target.groupId,
            projectId: null,
            protocolId: null
          }
        };
      });

      return;
    }

    const groupId = selectedDocument.id;
    const projectIdsInGroup = db.projects.filter((project) => project.groupId === groupId).map((project) => project.id);
    setCollapsedGroups((previous) => {
      const next = { ...previous };
      delete next[groupId];
      return next;
    });
    setCollapsedProjects((previous) => {
      const next = { ...previous };
      projectIdsInGroup.forEach((projectId) => {
        delete next[projectId];
      });
      return next;
    });

    setDb((previous) => {
      const target = previous.groups.find((item) => item.id === groupId);
      if (!target) {
        return previous;
      }

      const projectIds = new Set(previous.projects.filter((project) => project.groupId === groupId).map((project) => project.id));
      const groups = previous.groups.filter((item) => item.id !== groupId);
      const nextGroup = groups[0] ?? null;

      return {
        ...previous,
        groups,
        projects: previous.projects.filter((item) => item.groupId !== groupId),
        protocols: previous.protocols.filter((item) => !projectIds.has(item.projectId)),
        active: {
          groupId: nextGroup?.id ?? null,
          projectId: null,
          protocolId: null
        }
      };
    });
  };

  return (
    <main className="page">
      <div className="shell app-layout">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button type="button" onClick={handleNewGroup}>
              New Group
            </button>
            <button type="button" onClick={handleNewProject} disabled={!db.active.groupId}>
              New Project
            </button>
            <button type="button" onClick={handleNewProtocol} disabled={!db.active.projectId}>
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
          </div>

          <NotebookEditor
            key={selectedDocument ? `${selectedDocument.kind}-${selectedDocument.id}` : 'no-document'}
            initialContent={selectedDocument?.content ?? createBlankDocument()}
            editable={Boolean(selectedDocument)}
            documentKind={selectedDocument?.kind ?? 'protocol'}
            onEditorReady={setEditor}
            onDocumentChange={handleProtocolChange}
            onDeleteDocument={handleDeleteSelectedDocument}
          />
        </section>
      </div>
    </main>
  );
}
