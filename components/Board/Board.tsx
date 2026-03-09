"use client";
import React, { useEffect, useRef, useState } from 'react';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import AuthModal from '../Auth/AuthModal';
import supabase from '../../lib/supabaseClient';
import ProjectCard, { Project } from '../Card/ProjectCard';

const SOFTWARE_COLS = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Development', color: 'var(--col2)' },
  { label: 'Uploading / Deploying', color: 'var(--col3)' },
  { label: 'Live / Hosted', color: 'var(--col4)' },
  { label: '🗑️ Bin', color: 'var(--col5)' }
];

const BUSINESS_COLS = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Progress', color: 'var(--col2)' },
  { label: 'Cashflow', color: 'var(--col4)' },
  { label: '🗑️ Bin', color: 'var(--col5)' }
];

const STORAGE_KEY = 'pb_projects';

type ProjectType = 'software' | 'business';

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    desc: row.description || '',
    tags: row.tags || [],
    status: row.status,
    date: (row.created_at || '').slice(0,10),
    projectType: row.project_type === 'business' ? 'business' : 'software'
  };
}

function normalizeLocalProjects(raw: string): Project[] {
  return JSON.parse(raw).map((project: any) => ({
    ...project,
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
          const mapped: Project[] = data.map(mapProject);
          setProjects(mapped);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
          return;
        }

        // fallback seed
        const seed: Project[] = [
          { id: uid(), name: 'Portfolio Website', desc: 'Personal portfolio showcasing work and skills', tags: ['Next.js','Tailwind'], status: 3, date: '2024-12-01', projectType: 'software' },
          { id: uid(), name: 'Task Manager API', desc: 'REST API for task management with auth', tags: ['Node.js','Postgres'], status: 1, date: '2025-01-15', projectType: 'software' },
          { id: uid(), name: 'E-commerce Dashboard', desc: 'Admin dashboard for online store analytics', tags: ['React','Recharts'], status: 1, date: '2025-02-10', projectType: 'software' },
          { id: uid(), name: 'Mobile Budget App', desc: 'React Native budget tracker with charts', tags: ['React Native','Expo'], status: 0, date: '2025-03-01', projectType: 'software' },
          { id: uid(), name: 'Agency Partnership Plan', desc: 'Quarterly business growth roadmap for agency partnerships', tags: ['Sales','Planning'], status: 0, date: '2025-02-05', projectType: 'business' },
          { id: uid(), name: 'AI Chat Interface', desc: 'Claude-powered conversational UI', tags: ['Next.js','Supabase'], status: 2, date: '2025-02-20', projectType: 'software' }
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
          setProjects((p) => p.map(x => x.id === row.id ? mapProject(row) : x));
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

  function editProject(id: string) {
    setEditId(id);
    setModalOpen(true);
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

  async function saveProject(payload: { name: string; desc?: string; tags?: string[]; status: number; projectType: ProjectType }) {
    try {
      if (editId) {
        const updates = {
          name: payload.name,
          description: payload.desc || null,
          tags: payload.tags || [],
          status: payload.status,
          project_type: payload.projectType,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from('projects').update(updates).eq('id', editId).eq('user_id', user.id).select();
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
          setProjects((p) => p.map(x => x.id === row.id ? mapProject(row) : x));
        }
      } else {
        const toInsert = {
          name: payload.name,
          description: payload.desc || null,
          user_id: user.id,
          tags: payload.tags || [],
          status: payload.status,
          project_type: payload.projectType
        };
        const { data, error } = await supabase.from('projects').insert([toInsert]).select();
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
          setProjects((p) => [...p, mapProject(row)]);
        }
      }
    } catch (err) {
      console.warn('Supabase save failed, falling back to local save:', err);
      if (editId) {
        setProjects((p) => p.map(x => x.id === editId ? { ...x, ...payload } : x));
      } else {
        setProjects((p) => [...p, { id: uid(), date: new Date().toISOString().slice(0,10), ...payload }]);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }

    closeModal();
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
          setProjects((p) => p.map(x => x.id === row.id ? mapProject(row) : x));
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
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
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
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <div className="pill">{user.email}</div>
              <button className="btn-primary" onClick={() => openModal()}>
                <span className="btn-icon">+</span> New Project
              </button>
              <button className="btn-secondary" onClick={async () => { await supabase.auth.signOut(); setUser(null); }}>Sign out</button>
            </div>
          ) : (
            <div style={{display:'flex', gap:8}}>
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

        <div className="board" id="board">
          {activeColumns.map((col, idx) => {
            const cards = filteredProjects.filter(p => p.status === idx);
            return (
              <div key={idx} className={`column col-${idx}`}>
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
                      <ProjectCard project={p} onEdit={editProject} onDelete={deleteProject} />
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
      {/* Auth modal */}
      {authOpen ? <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authInitialMode} /> : null}
    </div>
  );
}

function ProjectForm({ projects, editId, selectedType, onCancel, onSave }: { projects: Project[]; editId: string | null; selectedType: ProjectType; onCancel: () => void; onSave: (p: { name: string; desc?: string; tags?: string[]; status: number; projectType: ProjectType }) => void; }) {
  const editing = editId ? projects.find(p => p.id === editId) : null;
  const [name, setName] = useState(editing?.name || '');
  const [desc, setDesc] = useState(editing?.desc || '');
  const [tagsRaw, setTagsRaw] = useState((editing?.tags || []).join(', '));
  const initialProjectType = editing?.projectType ?? selectedType;
  const [status, setStatus] = useState<number>(normalizeStatusForType(editing?.status ?? 0, initialProjectType));
  const [projectType, setProjectType] = useState<ProjectType>(initialProjectType);
  const statusOptions = getColumnsForType(projectType);

  useEffect(() => {
    const nextProjectType = editing?.projectType ?? selectedType;
    setName(editing?.name || '');
    setDesc(editing?.desc || '');
    setTagsRaw((editing?.tags || []).join(', '));
    setStatus(normalizeStatusForType(editing?.status ?? 0, nextProjectType));
    setProjectType(nextProjectType);
  }, [editId, editing, selectedType]);

  useEffect(() => {
    setStatus((currentStatus) => normalizeStatusForType(currentStatus, projectType));
  }, [projectType]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    onSave({ name: name.trim(), desc: desc.trim(), tags, status, projectType });
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
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary">Save Project</button>
      </div>
    </form>
  );
}

