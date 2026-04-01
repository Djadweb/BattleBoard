"use client";
import React, { useEffect, useRef, useState } from 'react';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import AuthModal from '../Auth/AuthModal';
import supabase from '../../lib/supabaseClient';
import ProjectCard, { Project, TodoItem } from '../Card/ProjectCard';

const SOFTWARE_COLS = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Development', color: 'var(--col2)' },
  { label: 'Uploading / Deploying', color: 'var(--col3)' },
  { label: 'Live / Hosted', color: 'var(--col4)' },
  { label: 'Marketing', color: 'var(--col5)' },
  { label: '🗑️ Bin', color: 'var(--col6)' }
];

const BUSINESS_COLS = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Progress', color: 'var(--col2)' },
  { label: 'Cashflow', color: 'var(--col4)' },
  { label: 'Marketing', color: 'var(--col5)' },
  { label: '🗑️ Bin', color: 'var(--col6)' }
];

const STORAGE_KEY = 'pb_projects';

type ProjectType = 'software' | 'business';
type ProjectPayload = { name: string; desc?: string; tags?: string[]; todos: TodoItem[]; status: number; projectType: ProjectType };

function normalizeTodos(input: unknown): TodoItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((todo: any) => ({
      id: typeof todo?.id === 'string' && todo.id ? todo.id : uid(),
      text: typeof todo?.text === 'string' ? todo.text.trim() : '',
      completed: Boolean(todo?.completed)
    }))
    .filter((todo) => todo.text.length > 0);
}

function mapProject(row: any, fallback?: Partial<Project> | null): Project {
  const hasTodos = row && typeof row === 'object' && 'todos' in row;

  return {
    id: row.id,
    name: row.name,
    desc: row.description || '',
    tags: row.tags || [],
    todos: hasTodos ? normalizeTodos(row.todos) : normalizeTodos(fallback?.todos),
    status: row.status,
    date: (row.created_at || '').slice(0,10),
    projectType: row.project_type === 'business' ? 'business' : 'software'
  };
}

function normalizeLocalProjects(raw: string): Project[] {
  return JSON.parse(raw).map((project: any) => ({
    ...project,
    todos: normalizeTodos(project.todos),
    projectType: project.projectType === 'business' ? 'business' : 'software'
  }));
}

function getColumnsForType(projectType: ProjectType) {
  return projectType === 'business' ? BUSINESS_COLS : SOFTWARE_COLS;
}

function normalizeStatusForType(status: number, projectType: ProjectType) {
  const maxStatus = getColumnsForType(projectType).length - 1;
  if (Number.isNaN(status) || status < 0) return 0;
  return Math.min(status, maxStatus);
}

function uid() { return Math.random().toString(36).slice(2,10); }

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedType, setSelectedType] = useState<ProjectType>('software');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  const [user, setUser] = useState<any | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const dragIdRef = useRef<string | null>(null);

  // Load projects only when user is authenticated
  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
        if (error) {
          console.warn('Supabase read error, falling back to localStorage:', error.message || error.code || error);
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw && mounted) {
            setProjects(normalizeLocalProjects(raw));
            return;
          }
        } else if (data) {
          if (!mounted) return;
          const raw = localStorage.getItem(STORAGE_KEY);
          const localProjects = raw ? normalizeLocalProjects(raw) : [];
          const localProjectsById = new Map(localProjects.map((project) => [project.id, project]));
          const mapped: Project[] = data.map((row) => mapProject(row, localProjectsById.get(row.id)));
          setProjects(mapped);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
          return;
        }

        // fallback seed
        const seed: Project[] = [
          { id: uid(), name: 'Portfolio Website', desc: 'Personal portfolio showcasing work and skills', tags: ['Next.js','Tailwind'], todos: [], status: 3, date: '2024-12-01', projectType: 'software' },
          { id: uid(), name: 'Task Manager API', desc: 'REST API for task management with auth', tags: ['Node.js','Postgres'], todos: [], status: 1, date: '2025-01-15', projectType: 'software' },
          { id: uid(), name: 'E-commerce Dashboard', desc: 'Admin dashboard for online store analytics', tags: ['React','Recharts'], todos: [], status: 1, date: '2025-02-10', projectType: 'software' },
          { id: uid(), name: 'Mobile Budget App', desc: 'React Native budget tracker with charts', tags: ['React Native','Expo'], todos: [], status: 0, date: '2025-03-01', projectType: 'software' },
          { id: uid(), name: 'Agency Partnership Plan', desc: 'Quarterly business growth roadmap for agency partnerships', tags: ['Sales','Planning'], todos: [], status: 0, date: '2025-02-05', projectType: 'business' },
          { id: uid(), name: 'AI Chat Interface', desc: 'Claude-powered conversational UI', tags: ['Next.js','Supabase'], todos: [], status: 2, date: '2025-02-20', projectType: 'software' }
        ];
        if (!mounted) return;
        setProjects(seed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      } catch (err) {
        console.error('Unexpected error loading projects:', err);
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && mounted) setProjects(normalizeLocalProjects(raw));
      }
    }

    load();

    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  // Realtime subscription to projects table (only when signed in)
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`public:projects:user:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const ev = payload.eventType;
        const row: any = payload.new || payload.old;
        if (!row) return;
        if (ev === 'INSERT') {
          setProjects((p) => {
            if (p.find(x => x.id === row.id)) return p;
            return [...p, mapProject(row)];
          });
        } else if (ev === 'UPDATE') {
          setProjects((p) => p.map((project) => project.id === row.id ? mapProject(row, project) : project));
        } else if (ev === 'DELETE') {
          setProjects((p) => p.filter(x => x.id !== row.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // auth session handling
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setUser(data.session?.user ?? null);
      } catch (err) {
        // ignore
      } finally {
        if (mounted) setSessionLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // auto-open auth modal when unauthenticated
  useEffect(() => {
    if (!sessionLoading && !user) setAuthOpen(true);
    if (user) setAuthOpen(false);
  }, [sessionLoading, user]);

  function openModal(reset = true) {
    if (reset) {
      setEditId(null);
      setFormResetKey(k => k + 1);
    }
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }
  function closeDetailsModal() { setDetailsId(null); setDetailsEditing(false); }
  function openDetailsModal(id: string) { setDetailsId(id); setDetailsEditing(false); }

  function editProject(id: string) {
    setEditId(id);
    setModalOpen(true);
  }

  async function updateProjectTodos(projectId: string, todos: TodoItem[]) {
    const nextTodos = normalizeTodos(todos);
    setProjects((currentProjects) => currentProjects.map((project) => (
      project.id === projectId ? { ...project, todos: nextTodos } : project
    )));

    try {
      const { data, error } = await supabase
        .from('projects')
        .update({ todos: nextTodos, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .eq('user_id', user.id)
        .select();

      if (error) throw error;

      if (data && data.length > 0) {
        const row = data[0];
        setProjects((currentProjects) => currentProjects.map((project) => (
          project.id === row.id ? mapProject(row, project) : project
        )));
      }
    } catch (err) {
      console.warn('Supabase todo save failed, keeping local todo state:', err);
    }
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project?')) return;
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      setProjects((p) => p.filter(x => x.id !== id));
    } catch (err) {
      // fallback to local remove
      console.warn('Supabase delete failed, falling back to local remove:', err);
      setProjects((p) => p.filter(x => x.id !== id));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.filter(x => x.id !== id)));
    }
  }

  async function persistProject(payload: ProjectPayload, targetId: string | null) {
    try {
      if (targetId) {
        const updates = {
          name: payload.name,
          description: payload.desc || null,
          tags: payload.tags || [],
          todos: payload.todos,
          status: payload.status,
          project_type: payload.projectType,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from('projects').update(updates).eq('id', targetId).eq('user_id', user.id).select();
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
          setProjects((currentProjects) => currentProjects.map((project) => (
            project.id === row.id ? mapProject(row, { ...project, todos: payload.todos }) : project
          )));
        }
      } else {
        const toInsert = {
          name: payload.name,
          description: payload.desc || null,
          user_id: user.id,
          tags: payload.tags || [],
          todos: payload.todos,
          status: payload.status,
          project_type: payload.projectType
        };
        const { data, error } = await supabase.from('projects').insert([toInsert]).select();
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
          setProjects((currentProjects) => [...currentProjects, mapProject(row, { todos: payload.todos })]);
        }
      }
    } catch (err) {
      console.warn('Supabase save failed, falling back to local save:', err);
      if (targetId) {
        setProjects((p) => p.map(x => x.id === targetId ? { ...x, ...payload } : x));
      } else {
        setProjects((p) => [...p, { id: uid(), date: new Date().toISOString().slice(0,10), ...payload }]);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
  }

  async function saveProject(payload: ProjectPayload) {
    await persistProject(payload, editId);
    closeModal();
  }

  async function saveDetailsProject(payload: ProjectPayload) {
    if (!detailsId) return;
    await persistProject(payload, detailsId);
    setDetailsEditing(false);
  }

  function onDragStart(id?: string) { dragIdRef.current = id || null; }
  function onDragEnd() { dragIdRef.current = null; }

  function onDropToColumn(idx: number) {
    const id = dragIdRef.current;
    if (!id) return;
    // optimistic UI update
    setProjects((p) => {
      const next = p.map(x => x.id === id ? { ...x, status: idx } : x);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });

    // persist change to Supabase (best-effort). If the project is only local (no DB), this will fail and we keep local state.
    (async () => {
      try {
        const { data, error } = await supabase.from('projects').update({ status: idx, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).select();
        if (error) {
          // log and keep optimistic change
          console.warn('Failed to persist status change to Supabase:', (error as any).message || error);
          return;
        }
        if (data && (data as any).length > 0) {
          const row = (data as any)[0];
          setProjects((currentProjects) => currentProjects.map((project) => (
            project.id === row.id ? mapProject(row, project) : project
          )));
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) {}
        }
      } catch (err) {
        console.warn('Unexpected error updating project status:', err);
      }
    })();
  }

  const activeColumns = getColumnsForType(selectedType);
  const filteredProjects = projects
    .filter((project) => project.projectType === selectedType)
    .map((project) => ({ ...project, status: normalizeStatusForType(project.status, selectedType) }));
  const detailsProject = detailsId ? projects.find((project) => project.id === detailsId) ?? null : null;
  const detailsStatusLabel = detailsProject ? getColumnsForType(detailsProject.projectType)[normalizeStatusForType(detailsProject.status, detailsProject.projectType)]?.label ?? 'Unknown' : '';
  const counts = new Array(activeColumns.length).fill(0);
  filteredProjects.forEach(p => counts[p.status] = (counts[p.status] || 0) + 1);
  const total = filteredProjects.length;
  const progressColumnIndex = selectedType === 'business' ? 2 : 3;
  const livePct = total ? Math.round(((counts[progressColumnIndex]||0)/total)*100) : 0;
  // If still checking session, show a simple loading state
  if (sessionLoading) {
    return (
      <div className="app" style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>
        <div className="empty">Checking authentication...</div>
      </div>
    );
  }

  // If not signed in, lock the UI and show auth modal
  if (!user) {
    return (
      <div className="app">
        <header>
          <div className="logo">
            <div className="logo-mark">PB</div>
            <div className="logo-text">Project<span>Board</span></div>
          </div>
        </header>
        <main style={{display:'flex',alignItems:'center',justifyContent:'center',height:'70vh'}}>
          <div style={{textAlign:'center'}}>
            <div className="modal-title">Sign in required</div>
            <div style={{marginTop:12}} className="empty">You must be signed in to access Project Board.</div>
            <div style={{marginTop:12}}>
              <button className="btn-primary" onClick={() => { setAuthInitialMode('signup'); setAuthOpen(true); }}>Sign in / Create account</button>
            </div>
          </div>
        </main>
        {authOpen ? <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="logo">
          <div className="logo-mark">PB</div>
          <div className="logo-text">Project<span>Board</span></div>
        </div>
        <div className="header-right">
          <div className="header-controls">
            <div className="project-type-toggle" role="tablist" aria-label="Project type filter">
              <button
                type="button"
                className={`project-type-toggle-btn ${selectedType === 'software' ? 'active' : ''}`}
                onClick={() => setSelectedType('software')}
                aria-pressed={selectedType === 'software'}
              >
                Software
              </button>
              <button
                type="button"
                className={`project-type-toggle-btn ${selectedType === 'business' ? 'active' : ''}`}
                onClick={() => setSelectedType('business')}
                aria-pressed={selectedType === 'business'}
              >
                Business
              </button>
            </div>
            <ThemeToggle />
            <div className="pill" id="date-pill">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          {user ? (
            <div className="session-controls">
              <div className="pill email-pill" title={user.email}>{user.email}</div>
              <button className="btn-primary" onClick={() => openModal()}>
                <span className="btn-icon">+</span> New Project
              </button>
              <button className="btn-secondary" onClick={async () => { await supabase.auth.signOut(); setUser(null); }}>Sign out</button>
            </div>
          ) : (
            <div className="session-controls">
              <button className="btn-secondary" onClick={() => { setAuthInitialMode('signin'); setAuthOpen(true); }}>Sign in</button>
              <button className="btn-primary" onClick={() => openModal()}>
                <span className="btn-icon">+</span> New Project
              </button>
            </div>
          )}
        </div>
      </header>

      <main>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label"><span className="stat-dot" style={{background:'var(--text)'}}></span>Total</div>
            <div className="stat-value">{total}</div>
          </div>
          {activeColumns.map((c, i) => (
            <div key={i} className="stat-item">
              <div className="stat-label"><span className="stat-dot" style={{background:c.color}}></span>{c.label}</div>
              <div className="stat-value">{counts[i]||0}</div>
              {i===progressColumnIndex && <div className="progress-bar"><div className="progress-fill" style={{width:`${livePct}%`}}></div></div>}
            </div>
          ))}
        </div>

        <div className="board-header">
          <div className="board-title">{selectedType === 'software' ? 'Software Projects' : 'Business Projects'}</div>
          <div className="view-toggle">
            <button className="view-btn active" title="Kanban">⊞</button>
            <button className="view-btn" title="List">☰</button>
          </div>
        </div>

        <div className="board" id="board" style={{ '--board-cols': activeColumns.length } as React.CSSProperties}>
          {activeColumns.map((col, idx) => {
            const cards = filteredProjects.filter(p => p.status === idx);
            return (
              <div key={idx} className={`column col-${idx}`} style={{ '--column-accent': col.color } as React.CSSProperties}>
                <div className="col-header">
                  <div className="col-name"><span className="col-name-dot" style={{background:col.color}}></span>{col.label}</div>
                  <span className="col-count">{cards.length}</span>
                </div>
                <div className="col-body" data-col={idx}
                  onDragOver={(e) => { e.preventDefault(); (e.currentTarget.parentElement as HTMLElement)?.classList.add('drag-over'); }}
                  onDragLeave={(e) => (e.currentTarget.parentElement as HTMLElement)?.classList.remove('drag-over')}
                  onDrop={(e) => { e.preventDefault(); (e.currentTarget.parentElement as HTMLElement)?.classList.remove('drag-over'); onDropToColumn(idx); }}>
                  {cards.length === 0 ? <div className="empty">No projects yet<br/>drag one here</div> : null}
                  {cards.map(p => (
                    <div key={p.id}
                      onDragStart={() => onDragStart(p.id)}
                      onDragEnd={() => onDragEnd()}>
                      <ProjectCard project={p} onEdit={editProject} onDelete={deleteProject} onOpen={openDetailsModal} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal (inline form) */}
      <div className={`overlay ${modalOpen ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" id="modal">
          <div className="modal-header">
            <div className="modal-title">{editId ? 'Edit Project' : 'New Project'}</div>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <ProjectForm key={`${editId ?? 'new'}-${formResetKey}`} projects={projects} editId={editId} selectedType={selectedType} onCancel={closeModal} onSave={saveProject} />
        </div>
      </div>
      <div className={`overlay ${detailsProject ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeDetailsModal(); }}>
        <div className="modal details-modal" role="dialog" aria-modal="true" aria-labelledby="project-details-title">
          {detailsProject ? (
            <>
              <div className="modal-header">
                <div>
                  <div className="modal-title" id="project-details-title">{detailsEditing ? 'Edit Task' : detailsProject.name}</div>
                  <div className="details-subtitle">{detailsEditing ? detailsProject.name : detailsProject.projectType === 'software' ? 'Software Task' : 'Business Task'}</div>
                </div>
                <button className="modal-close" onClick={closeDetailsModal}>✕</button>
              </div>
              {detailsEditing ? (
                <ProjectForm
                  projects={projects}
                  editId={detailsProject.id}
                  selectedType={detailsProject.projectType}
                  onCancel={() => setDetailsEditing(false)}
                  onSave={saveDetailsProject}
                  cancelLabel="Back"
                  submitLabel="Save Changes"
                />
              ) : (
                <>
                  <div className="details-grid">
                    <div className="details-item">
                      <div className="details-label">Status</div>
                      <div className="details-value">{detailsStatusLabel}</div>
                    </div>
                    <div className="details-item">
                      <div className="details-label">Created</div>
                      <div className="details-value">{new Date(detailsProject.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="details-section">
                    <div className="details-label">Description</div>
                    <div className="details-body">{detailsProject.desc || 'No description added yet.'}</div>
                  </div>
                  <div className="details-section">
                    <div className="details-label">Tags</div>
                    {detailsProject.tags && detailsProject.tags.length ? (
                      <div className="card-tags details-tags">
                        {detailsProject.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                      </div>
                    ) : (
                      <div className="details-body">No tags added yet.</div>
                    )}
                  </div>
                  <div className="details-section">
                    <TodoListEditor
                      todos={detailsProject.todos}
                      onChange={(nextTodos) => updateProjectTodos(detailsProject.id, nextTodos)}
                      title="Todo List"
                      helperText="Manage the checklist for this task directly from the popup."
                      emptyLabel="No todo items added yet."
                      addLabel="Add Todo"
                    />
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn-secondary" onClick={closeDetailsModal}>Close</button>
                    <button type="button" className="btn-primary" onClick={() => setDetailsEditing(true)}>Edit Task</button>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
      {/* Auth modal */}
      {authOpen ? <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authInitialMode} /> : null}
    </div>
  );
}

function ProjectForm({ projects, editId, selectedType, onCancel, onSave, cancelLabel = 'Cancel', submitLabel = 'Save Project' }: { projects: Project[]; editId: string | null; selectedType: ProjectType; onCancel: () => void; onSave: (p: ProjectPayload) => void | Promise<void>; cancelLabel?: string; submitLabel?: string; }) {
  const editing = editId ? projects.find(p => p.id === editId) : null;
  const [name, setName] = useState(editing?.name || '');
  const [desc, setDesc] = useState(editing?.desc || '');
  const [tagsRaw, setTagsRaw] = useState((editing?.tags || []).join(', '));
  const [todos, setTodos] = useState<TodoItem[]>(normalizeTodos(editing?.todos));
  const initialProjectType = editing?.projectType ?? selectedType;
  const [status, setStatus] = useState<number>(normalizeStatusForType(editing?.status ?? 0, initialProjectType));
  const [projectType, setProjectType] = useState<ProjectType>(initialProjectType);
  const statusOptions = getColumnsForType(projectType);

  useEffect(() => {
    const nextProjectType = editing?.projectType ?? selectedType;
    setName(editing?.name || '');
    setDesc(editing?.desc || '');
    setTagsRaw((editing?.tags || []).join(', '));
    setTodos(normalizeTodos(editing?.todos));
    setStatus(normalizeStatusForType(editing?.status ?? 0, nextProjectType));
    setProjectType(nextProjectType);
  }, [editId, editing, selectedType]);

  useEffect(() => {
    setStatus((currentStatus) => normalizeStatusForType(currentStatus, projectType));
  }, [projectType]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    await onSave({ name: name.trim(), desc: desc.trim(), tags, todos, status, projectType });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label">Project Name *</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Portfolio Redesign" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's this project about?"></textarea>
      </div>
      <div className="form-group">
        <label className="form-label">Tags (comma separated)</label>
        <input className="form-input" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="e.g. Next.js, Supabase, UI" />
      </div>
      <div className="form-group">
        <label className="form-label">Project Type</label>
        <select className="form-select" value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)}>
          <option value="software">Software Project</option>
          <option value="business">Business Project</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Status</label>
        <select className="form-select" value={status} onChange={(e) => setStatus(Number(e.target.value))}>
          {statusOptions.map((option, index) => (
            <option key={`${projectType}-${index}`} value={index}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <TodoListEditor
          todos={todos}
          onChange={setTodos}
          title="Related Todo List"
          helperText="Add checklist items for this task before you save it."
          emptyLabel="No todo items yet."
          addLabel="Add Todo"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="btn-primary">{submitLabel}</button>
      </div>
    </form>
  );
}

function TodoListEditor({
  todos,
  onChange,
  title,
  helperText,
  emptyLabel,
  addLabel
}: {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
  title: string;
  helperText?: string;
  emptyLabel: string;
  addLabel: string;
}) {
  const [draft, setDraft] = useState('');
  const normalizedTodos = normalizeTodos(todos);
  const completedCount = normalizedTodos.filter((todo) => todo.completed).length;

  function addTodo() {
    const text = draft.trim();
    if (!text) return;
    onChange([...normalizedTodos, { id: uid(), text, completed: false }]);
    setDraft('');
  }

  function updateTodo(todoId: string, text: string) {
    onChange(normalizedTodos.map((todo) => todo.id === todoId ? { ...todo, text } : todo));
  }

  function toggleTodo(todoId: string) {
    onChange(normalizedTodos.map((todo) => todo.id === todoId ? { ...todo, completed: !todo.completed } : todo));
  }

  function deleteTodo(todoId: string) {
    onChange(normalizedTodos.filter((todo) => todo.id !== todoId));
  }

  return (
    <div className="todo-editor">
      <div className="todo-editor-header">
        <div>
          <div className="form-label todo-label">{title}</div>
          {helperText ? <div className="todo-helper">{helperText}</div> : null}
        </div>
        <div className="todo-summary">{completedCount}/{normalizedTodos.length} done</div>
      </div>
      <div className="todo-add-row">
        <input
          className="form-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addTodo();
            }
          }}
          placeholder="Add a todo item"
        />
        <button type="button" className="btn-secondary todo-add-btn" onClick={addTodo}>{addLabel}</button>
      </div>
      {normalizedTodos.length ? (
        <div className="todo-list" role="list">
          {normalizedTodos.map((todo) => (
            <div className="todo-item" key={todo.id} role="listitem">
              <button
                type="button"
                className={`todo-toggle ${todo.completed ? 'checked' : ''}`}
                onClick={() => toggleTodo(todo.id)}
                aria-pressed={todo.completed}
                aria-label={todo.completed ? `Mark "${todo.text}" as not done` : `Mark "${todo.text}" as done`}
              >
                {todo.completed ? '✓' : ''}
              </button>
              <input
                className={`todo-input ${todo.completed ? 'checked' : ''}`}
                value={todo.text}
                onChange={(event) => updateTodo(todo.id, event.target.value)}
                placeholder="Todo text"
              />
              <button type="button" className="todo-delete" onClick={() => deleteTodo(todo.id)} aria-label={`Delete "${todo.text}"`}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="todo-empty">{emptyLabel}</div>
      )}
    </div>
  );
}
