"use client";
import React, { useEffect, useRef, useState } from 'react';
import ThemeToggle from '../ThemeToggle/ThemeToggle';
import AuthModal from '../Auth/AuthModal';
import ExportModal from '../Export/ExportModal';
import supabase from '../../lib/supabaseClient';
import ProjectCard, { Project, TodoItem } from '../Card/ProjectCard';
import { getColumnsForType, normalizeStatusForType, type ProjectType } from '../../lib/projectColumns';

const STORAGE_KEY = 'pb_projects';
const VIEW_STORAGE_KEY = 'pb_view';
const MOBILE_QUERY = '(max-width: 600px)';

type BoardView = 'kanban' | 'list';

type ProjectPayload = { name: string; desc?: string; tags?: string[]; todos: TodoItem[]; status: number; sortOrder?: number; projectType: ProjectType; isFun?: boolean };

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
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : (fallback?.sortOrder ?? 0),
    date: (row.created_at || '').slice(0,10),
    projectType: row.project_type === 'business' ? 'business' : 'software',
    isFun: row.is_fun === true
  };
}

function normalizeLocalProjects(raw: string): Project[] {
  return JSON.parse(raw).map((project: any) => ({
    ...project,
    todos: normalizeTodos(project.todos),
    sortOrder: typeof project.sortOrder === 'number' ? project.sortOrder : 0,
    projectType: project.projectType === 'business' ? 'business' : 'software',
    isFun: project.isFun === true
  }));
}

function uid() { return Math.random().toString(36).slice(2,10); }

export default function Board() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedType, setSelectedType] = useState<ProjectType>('software');
  const [view, setView] = useState<BoardView>('kanban');
  const [isMobile, setIsMobile] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsEditing, setDetailsEditing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup'>('signin');
  const [user, setUser] = useState<any | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ colIdx: number; cardIdx: number; position: 'before' | 'after' } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);

  // Load projects only when user is authenticated
  useEffect(() => {
    if (!user) return;
    let mounted = true;

    async function load() {
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('user_id', user.id).order('status', { ascending: true }).order('sort_order', { ascending: true });
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
          { id: uid(), name: 'Portfolio Website', desc: 'Personal portfolio showcasing work and skills', tags: ['Next.js','Tailwind'], todos: [], status: 3, sortOrder: 0, date: '2024-12-01', projectType: 'software' },
          { id: uid(), name: 'Task Manager API', desc: 'REST API for task management with auth', tags: ['Node.js','Postgres'], todos: [], status: 1, sortOrder: 0, date: '2025-01-15', projectType: 'software' },
          { id: uid(), name: 'E-commerce Dashboard', desc: 'Admin dashboard for online store analytics', tags: ['React','Recharts'], todos: [], status: 1, sortOrder: 1, date: '2025-02-10', projectType: 'software' },
          { id: uid(), name: 'Mobile Budget App', desc: 'React Native budget tracker with charts', tags: ['React Native','Expo'], todos: [], status: 0, sortOrder: 0, date: '2025-03-01', projectType: 'software' },
          { id: uid(), name: 'Agency Partnership Plan', desc: 'Quarterly business growth roadmap for agency partnerships', tags: ['Sales','Planning'], todos: [], status: 0, sortOrder: 0, date: '2025-02-05', projectType: 'business' },
          { id: uid(), name: 'AI Chat Interface', desc: 'Claude-powered conversational UI', tags: ['Next.js','Supabase'], todos: [], status: 2, sortOrder: 0, date: '2025-02-20', projectType: 'software' },
          { id: uid(), name: 'Game Jam Prototype', desc: 'Weekend game jam entry - procedural platformer', tags: ['Unity','C#'], todos: [], status: 2, sortOrder: 0, date: '2025-03-15', projectType: 'software', isFun: true },
          { id: uid(), name: 'Generative Art Sketch', desc: 'Creative coding experiment with p5.js', tags: ['p5.js','Creative Coding'], todos: [], status: 1, sortOrder: 0, date: '2025-03-20', projectType: 'software', isFun: true }
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

  // Restore the preferred view (after mount, so SSR output stays stable)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_STORAGE_KEY);
      if (raw === 'kanban' || raw === 'list') setView(raw);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch {}
  }, [view]);

  // On small screens the view toggle is hidden, so the list view takes over
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const activeView: BoardView = isMobile ? 'list' : view;

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
    const sessionTimeout = window.setTimeout(() => {
      if (mounted) setSessionLoading(false);
    }, 1200);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setUser(data.session?.user ?? null);
      } catch (err) {
        // ignore
      } finally {
        if (mounted) {
          setSessionLoading(false);
          window.clearTimeout(sessionTimeout);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(sessionTimeout);
      sub.subscription.unsubscribe();
    };
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
    setMobileMenuOpen(false);
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }
  function closeDetailsModal() { setDetailsId(null); setDetailsEditing(false); }
  function openDetailsModal(id: string) {
    setMobileMenuOpen(false);
    setDetailsId(id);
    setDetailsEditing(false);
  }

  function editProject(id: string) {
    setMobileMenuOpen(false);
    setEditId(id);
    setModalOpen(true);
  }

  function openMobileMenu() {
    setMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
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
          sort_order: payload.sortOrder ?? 0,
          project_type: payload.projectType,
          is_fun: payload.isFun ?? false,
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
          sort_order: payload.sortOrder ?? 0,
          project_type: payload.projectType,
          is_fun: payload.isFun ?? false
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
        setProjects((p) => p.map(x => x.id === targetId ? { ...x, ...payload, sortOrder: payload.sortOrder ?? x.sortOrder } : x));
      } else {
        setProjects((p) => [...p, { id: uid(), date: new Date().toISOString().slice(0,10), sortOrder: payload.sortOrder ?? 0, ...payload }]);
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

  function onDragStart(e: React.DragEvent, id?: string) {
    dragIdRef.current = id || null;
    setDraggingId(id || null);
    setDropTarget(null);
    try { e.dataTransfer.effectAllowed = 'move'; } catch (e) {}
  }
  function onDragEnd() { dragIdRef.current = null; setDropTarget(null); setDraggingId(null); setDragOverCol(null); }

  function onCardDragOver(e: React.DragEvent, colIdx: number, cardIdx: number, cardId: string) {
    e.preventDefault();
    e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'move'; } catch (e) {}
    // Hovering the dragged card itself: show no indicator (drop would be a no-op)
    if (cardId === dragIdRef.current) {
      setDropTarget((prev) => (prev === null ? prev : null));
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setDropTarget((prev) => {
      if (prev && prev.colIdx === colIdx && prev.cardIdx === cardIdx && prev.position === position) return prev;
      return { colIdx, cardIdx, position };
    });
  }

  function onColumnDragOver(e: React.DragEvent, colIdx: number, cardCount: number) {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (e) {}
    // Hovering empty column space (card-level handler stops propagation when over a card,
    // so this only fires for gaps / empty columns): show indicator at the end.
    setDragOverCol(colIdx);
    if (cardCount === 0) {
      setDropTarget((prev) => (prev === null ? prev : null));
    } else {
      setDropTarget((prev) => {
        if (prev && prev.colIdx === colIdx && prev.cardIdx === cardCount - 1 && prev.position === 'after') return prev;
        return { colIdx, cardIdx: cardCount - 1, position: 'after' };
      });
    }
  }

  function onColumnDragLeave(e: React.DragEvent) {
    // Only clear when actually leaving the column (not when moving between cards inside it)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  function onDropToColumn(idx: number) {
    const id = dragIdRef.current;
    if (!id) return;
    const target = dropTarget;
    setDropTarget(null);
    setDragOverCol(null);
    // Clear drag state immediately so the card never stays stuck at low opacity
    // if the dragend event doesn't fire after the drop re-render.
    dragIdRef.current = null;
    setDraggingId(null);

    // Compute the new order synchronously from current state so we can persist it.
    const prev = projects;
    const dragged = prev.find(p => p.id === id);
    if (!dragged) return;

    // Dropped back onto itself with no target (same column): no-op, avoid useless writes.
    if (!target && dragged.status === idx) return;

    // Remove dragged card from its current position
    const withoutDragged = prev.filter(p => p.id !== id);

    // Cards in the target column (same type, excluding dragged), sorted by sortOrder.
    // Use the array position as the source of truth for cardIdx.
    const targetColCards = withoutDragged
      .filter(p => p.status === idx && p.projectType === dragged.projectType)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Determine insertion index within the full array
    let insertIdx: number;
    if (target && target.colIdx === idx) {
      const targetCard = targetColCards[target.cardIdx];
      const realIdx = targetCard ? withoutDragged.indexOf(targetCard) : -1;
      if (realIdx === -1) {
        // Target card not found (e.g. type filter mismatch): append after last card of this column
        let lastIdx = -1;
        withoutDragged.forEach((p, i) => {
          if (p.status === idx && p.projectType === dragged.projectType) lastIdx = i;
        });
        insertIdx = lastIdx === -1 ? withoutDragged.length : lastIdx + 1;
      } else {
        insertIdx = target.position === 'before' ? realIdx : realIdx + 1;
      }
    } else {
      // Dropped on empty column space: append after last card of this column
      let lastIdx = -1;
      withoutDragged.forEach((p, i) => {
        if (p.status === idx && p.projectType === dragged.projectType) lastIdx = i;
      });
      insertIdx = lastIdx === -1 ? withoutDragged.length : lastIdx + 1;
    }

    // Create the dragged card with updated status
    const updatedDragged = { ...dragged, status: idx };

    // Build new array
    const next = [...withoutDragged];
    next.splice(insertIdx, 0, updatedDragged);

    // Reassign sortOrder sequentially within each affected column (scoped to project type)
    const statusChanged = dragged.status !== idx;
    const affectedColumns = statusChanged ? [dragged.status, idx] : [idx];

    const reordered = [...next];
    for (const col of affectedColumns) {
      let order = 0;
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].status === col && reordered[i].projectType === dragged.projectType) {
          if (reordered[i].sortOrder !== order) {
            reordered[i] = { ...reordered[i], sortOrder: order };
          }
          order++;
        }
      }
    }

    setProjects(reordered);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reordered)); } catch (e) {}

    // persist to Supabase (best-effort): update every card in the affected columns
    (async () => {
      try {
        const toPersist = reordered.filter(
          p => p.projectType === dragged.projectType && affectedColumns.includes(p.status)
        );
        const results = await Promise.all(
          toPersist.map(p =>
            supabase
              .from('projects')
              .update({ status: p.status, sort_order: p.sortOrder, updated_at: new Date().toISOString() })
              .eq('id', p.id)
          )
        );
        const failed = results.find(r => (r as any).error);
        if (failed) {
          console.warn('Failed to persist reorder to Supabase:', (failed as any).error?.message || (failed as any).error);
        }
      } catch (err) {
        console.warn('Unexpected error persisting reorder:', err);
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
      <div className="app app-loading">
        <div className="loading-shell">
          <div className="logo">
            <div className="logo-mark">PB</div>
            <div className="logo-text">Project<span>Board</span></div>
          </div>
          <div className="loading-card">
            <div className="loading-title">Opening your workspace</div>
            <div className="loading-subtitle">Checking your session and restoring your boards.</div>
            <div className="loading-skeleton">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
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
              <button className="btn-secondary" onClick={() => { setMobileMenuOpen(false); setExportOpen(true); }} title="Export all projects">
                <span className="btn-icon">↓</span> Export
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
          <div className="view-toggle" role="group" aria-label="Board view">
            <button
              type="button"
              className={`view-btn ${activeView === 'kanban' ? 'active' : ''}`}
              title="Kanban"
              aria-label="Kanban view"
              aria-pressed={activeView === 'kanban'}
              onClick={() => setView('kanban')}
            >⊞</button>
            <button
              type="button"
              className={`view-btn ${activeView === 'list' ? 'active' : ''}`}
              title="List"
              aria-label="List view"
              aria-pressed={activeView === 'list'}
              onClick={() => setView('list')}
            >☰</button>
          </div>
        </div>

        {activeView === 'list' ? (
          <div className="list-view" id="list-view">
            {activeColumns.map((col, idx) => {
              const cards = filteredProjects
                .filter(p => p.status === idx)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <section
                  key={idx}
                  className="list-section"
                  aria-label={col.label}
                  style={{ '--column-accent': col.color } as React.CSSProperties}
                >
                  <div className="list-section-header">
                    <div className="col-name"><span className="col-name-dot" style={{background:col.color}}></span>{col.label}</div>
                    <span className="col-count">{cards.length}</span>
                  </div>
                  {cards.length === 0 ? (
                    <div className="empty list-empty">No projects here yet</div>
                  ) : cards.map((p) => {
                    const todos = Array.isArray(p.todos) ? p.todos : [];
                    const doneCount = todos.filter((todo) => todo.completed).length;
                    const todoPct = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
                    return (
                      <div
                        key={p.id}
                        className="list-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => openDetailsModal(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailsModal(p.id); } }}
                      >
                        <div className="list-row-main">
                          <div className="list-row-title">
                            <span className="list-row-name">{p.name}</span>
                            {p.isFun && <span className="fun-badge">Fun</span>}
                          </div>
                          {p.desc ? <div className="list-row-desc">{p.desc}</div> : null}
                          {p.tags && p.tags.length ? (
                            <div className="list-row-tags">{p.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
                          ) : null}
                        </div>
                        <div className="list-row-status">
                          <span className="status-pill"><span className="col-name-dot" style={{background:col.color}}></span>{col.label}</span>
                        </div>
                        <div className="list-row-todo">
                          {todos.length ? (
                            <>
                              <span className="list-todo-count">{doneCount}/{todos.length}</span>
                              <div className="list-todo-bar"><div className="list-todo-fill" style={{width:`${todoPct}%`}}></div></div>
                            </>
                          ) : (
                            <span className="list-todo-count muted">No todos</span>
                          )}
                        </div>
                        <div className="list-row-date">{new Date(p.date).toLocaleDateString()}</div>
                        <div className="list-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="action-btn" onClick={() => editProject(p.id)} title="Edit">✎</button>
                          <button className="action-btn danger" onClick={() => deleteProject(p.id)} title="Delete">✕</button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        ) : (
        <div className={`board${draggingId ? ' is-dragging' : ''}`} id="board" style={{ '--board-cols': activeColumns.length } as React.CSSProperties}>
          {activeColumns.map((col, idx) => {
            const cards = filteredProjects
              .filter(p => p.status === idx)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={idx} className={`column col-${idx}`} style={{ '--column-accent': col.color } as React.CSSProperties}>
                <div className="col-header">
                  <div className="col-name"><span className="col-name-dot" style={{background:col.color}}></span>{col.label}</div>
                  <span className="col-count">{cards.length}</span>
                </div>
                <div className="col-body" data-col={idx}
                  onDragOver={(e) => { onColumnDragOver(e, idx, cards.length); (e.currentTarget.parentElement as HTMLElement)?.classList.add('drag-over'); }}
                  onDragLeave={(e) => { onColumnDragLeave(e); (e.currentTarget.parentElement as HTMLElement)?.classList.remove('drag-over'); }}
                  onDrop={(e) => { e.preventDefault(); (e.currentTarget.parentElement as HTMLElement)?.classList.remove('drag-over'); onDropToColumn(idx); }}>
                  {cards.length === 0 ? (
                    draggingId && dragOverCol === idx ? (
                      <div className="card-placeholder" style={{ minHeight: 80 }} />
                    ) : (
                      <div className="empty">No projects yet<br/>drag one here</div>
                    )
                  ) : null}
                  {cards.map((p, cardIdx) => {
                    const isDropTarget = dropTarget?.colIdx === idx && dropTarget?.cardIdx === cardIdx;
                    const position = isDropTarget ? dropTarget?.position : null;
                    return (
                      <div
                        key={p.id}
                        onDragStart={(e) => onDragStart(e, p.id)}
                        onDragEnd={() => onDragEnd()}
                        onDragOver={(e) => onCardDragOver(e, idx, cardIdx, p.id)}
                        className={`card-wrapper${draggingId === p.id ? ' dragging' : ''}${position === 'before' ? ' drop-before' : ''}${position === 'after' ? ' drop-after' : ''}`}>
                        <ProjectCard project={p} onEdit={editProject} onDelete={deleteProject} onOpen={openDetailsModal} dragging={draggingId === p.id} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </main>

      <nav className="mobile-app-bar" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-app-bar-btn ${selectedType === 'software' ? 'active' : ''}`}
          onClick={() => {
            setMobileMenuOpen(false);
            setSelectedType('software');
          }}
          aria-pressed={selectedType === 'software'}
        >
          Software
        </button>
        <button
          type="button"
          className={`mobile-app-bar-btn ${selectedType === 'business' ? 'active' : ''}`}
          onClick={() => {
            setMobileMenuOpen(false);
            setSelectedType('business');
          }}
          aria-pressed={selectedType === 'business'}
        >
          Business
        </button>
        <button
          type="button"
          className="mobile-app-bar-btn mobile-app-bar-primary"
          onClick={() => openModal()}
        >
          <span className="mobile-app-bar-icon">＋</span>
          New
        </button>
        <button
          type="button"
          className="mobile-app-bar-btn"
          onClick={openMobileMenu}
          aria-expanded={mobileMenuOpen}
          aria-haspopup="dialog"
        >
          <span className="mobile-app-bar-icon">☰</span>
          Menu
        </button>
      </nav>

      <div className={`overlay mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeMobileMenu(); }}>
        <div className="modal mobile-menu-modal" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title">
          <div className="modal-header">
            <div>
              <div className="modal-title" id="mobile-menu-title">Menu</div>
              <div className="details-subtitle">ProjectBoard mobile actions</div>
            </div>
            <button className="modal-close" onClick={closeMobileMenu}>✕</button>
          </div>
          <div className="mobile-menu-stack">
            <div className="mobile-menu-row">
              <div>
                <div className="mobile-menu-label">Account</div>
                <div className="mobile-menu-value">{user.email}</div>
              </div>
            </div>
            <div className="mobile-menu-row mobile-menu-theme">
              <div>
                <div className="mobile-menu-label">Theme</div>
                <div className="mobile-menu-value">Switch between dark and light</div>
              </div>
              <ThemeToggle />
            </div>
            <button
              type="button"
              className="btn-secondary mobile-menu-action"
              onClick={() => { setMobileMenuOpen(false); setExportOpen(true); }}
            >
              Export projects
            </button>
            <button
              type="button"
              className="btn-secondary mobile-menu-action"
              onClick={async () => {
                closeMobileMenu();
                await supabase.auth.signOut();
                setUser(null);
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

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
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fallbackProjects={projects}
        userId={user?.id ?? null}
      />
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
  const [isFun, setIsFun] = useState<boolean>(editing?.isFun ?? false);
  const [activeTab, setActiveTab] = useState<'details' | 'todos' | 'settings'>('details');
  const statusOptions = getColumnsForType(projectType);
  const currentName = editing?.name || '';
  const currentDesc = editing?.desc || '';
  const currentTags = (editing?.tags || []).join(', ');
  const currentProjectType = editing?.projectType ?? selectedType;
  const currentIsFun = editing?.isFun ?? false;
  const currentStatus = editing?.status ?? 0;
  const isDirty = name.trim() !== currentName || desc.trim() !== currentDesc || tagsRaw !== currentTags || projectType !== currentProjectType || isFun !== currentIsFun || status !== currentStatus;

  useEffect(() => {
    const nextProjectType = editing?.projectType ?? selectedType;
    setName(editing?.name || '');
    setDesc(editing?.desc || '');
    setTagsRaw((editing?.tags || []).join(', '));
    setTodos(normalizeTodos(editing?.todos));
    setStatus(normalizeStatusForType(editing?.status ?? 0, nextProjectType));
    setProjectType(nextProjectType);
    setIsFun(editing?.isFun ?? false);
    setActiveTab('details');
  }, [editId, editing, selectedType]);

  useEffect(() => {
    setStatus((currentStatus) => normalizeStatusForType(currentStatus, projectType));
  }, [projectType]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    await onSave({ name: name.trim(), desc: desc.trim(), tags, todos, status, projectType, isFun });
  }

  const todoStats = {
    total: todos.length,
    completed: todos.filter(t => t.completed).length,
    pct: todos.length ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100) : 0
  };

  return (
    <form onSubmit={submit} className="project-form">
      <div className="form-tabs" role="tablist" aria-label="Form sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'details'}
          aria-controls="panel-details"
          id="tab-details"
          className={`form-tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          <span className="tab-icon" aria-hidden="true">📝</span>
          <span>Details</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'todos'}
          aria-controls="panel-todos"
          id="tab-todos"
          className={`form-tab ${activeTab === 'todos' ? 'active' : ''}`}
          onClick={() => setActiveTab('todos')}
        >
          <span className="tab-icon" aria-hidden="true">✓</span>
          <span>Todos</span>
          <span className="tab-badge">{todoStats.total}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          aria-controls="panel-settings"
          id="tab-settings"
          className={`form-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="tab-icon" aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </div>

      <div className="form-panels" role="tabpanel" id="panel-details" aria-labelledby="tab-details" hidden={activeTab !== 'details'}>
        <div className="form-section">
          <div className="form-field">
            <label className="form-label" htmlFor="project-name">
              Project Name <span className="required" aria-hidden="true">*</span>
            </label>
            <div className="input-wrapper">
              <input
                id="project-name"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Portfolio Redesign"
                autoFocus
                autoComplete="off"
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="project-desc">Description</label>
            <div className="input-wrapper">
              <textarea
                id="project-desc"
                className="form-textarea"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What's this project about? Add context, goals, links..."
                rows={3}
              ></textarea>
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="project-tags">Tags</label>
            <div className="input-wrapper">
              <TagsInput
                value={tagsRaw}
                onChange={setTagsRaw}
                placeholder="Add tags... (press Enter or comma)"
              />
            </div>
            <p className="form-hint">Press Enter or comma to add tags. Click to remove.</p>
          </div>
        </div>
      </div>

      <div className="form-panels" role="tabpanel" id="panel-todos" aria-labelledby="tab-todos" hidden={activeTab !== 'todos'}>
        <TodoListEditor
          todos={todos}
          onChange={setTodos}
          title="Todo List"
          helperText="Break down your project into actionable tasks"
          emptyLabel="No tasks yet. Add your first task below."
          addLabel="+ Add Task"
        />
      </div>

      <div className="form-panels" role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={activeTab !== 'settings'}>
        <div className="form-section">
          <div className="settings-group">
            <div className="settings-label">Project Type</div>
            <div className="type-options" role="radiogroup" aria-label="Project type">
              <label className={`type-option ${projectType === 'software' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="project-type"
                  value="software"
                  checked={projectType === 'software'}
                  onChange={() => setProjectType('software')}
                />
                <div className="type-option-content">
                  <span className="type-icon">💻</span>
                  <div className="type-info">
                    <span className="type-name">Software</span>
                    <span className="type-desc">Code, apps, APIs, websites</span>
                  </div>
                </div>
                <span className="type-indicator" aria-hidden="true"></span>
              </label>
              <label className={`type-option ${projectType === 'business' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="project-type"
                  value="business"
                  checked={projectType === 'business'}
                  onChange={() => setProjectType('business')}
                />
                <div className="type-option-content">
                  <span className="type-icon">💼</span>
                  <div className="type-info">
                    <span className="type-name">Business</span>
                    <span className="type-desc">Plans, strategy, operations</span>
                  </div>
                </div>
                <span className="type-indicator" aria-hidden="true"></span>
              </label>
            </div>
          </div>

          <div className="settings-group">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={isFun}
                onChange={(e) => setIsFun(e.target.checked)}
              />
              <span className="toggle-slider" aria-hidden="true"></span>
              <div className="toggle-content">
                <span className="toggle-label">Fun Project</span>
                <span className="toggle-desc">Mark as a side project or experiment</span>
              </div>
              {isFun && <span className="toggle-fun-badge" aria-hidden="true">Fun</span>}
            </label>
          </div>

          <div className="settings-group">
            <label className="form-label" htmlFor="project-status">Status</label>
            <div className="input-wrapper">
              <select
                id="project-status"
                className="form-select"
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
              >
                {statusOptions.map((option, index) => (
                  <option key={`${projectType}-${index}`} value={index}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={!isDirty && !editId}
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={!name.trim() || (!isDirty && !!editId)}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TagsInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const tags = value.split(',').map(t => t.trim()).filter(Boolean);
  const [inputValue, setInputValue] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const newTags = [...tags, inputValue.trim()];
      onChange(newTags.join(', '));
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      const newTags = tags.slice(0, -1);
      onChange(newTags.join(', '));
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
  }

  function removeTag(tagToRemove: string) {
    const newTags = tags.filter(t => t !== tagToRemove);
    onChange(newTags.join(', '));
  }

  return (
    <div className="tags-input">
      <div className="tags-display">
        {tags.map(tag => (
          <span key={tag} className="tag-pill">
            <span>{tag}</span>
            <button type="button" className="tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className="tags-input-field"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={tags.length ? '' : placeholder}
        aria-label="Add tag"
      />
    </div>
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
  const completionPct = normalizedTodos.length ? Math.round((completedCount / normalizedTodos.length) * 100) : 0;

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
        <div className="todo-editor-copy">
          <div className="form-label todo-label">{title}</div>
          {helperText ? <div className="todo-helper">{helperText}</div> : null}
        </div>
        <div className="todo-summary">
          <span className="todo-summary-count">{completedCount}</span>
          <span className="todo-summary-sep">/</span>
          <span>{normalizedTodos.length}</span>
          <span className="todo-summary-label">done</span>
        </div>
      </div>
      <div className="todo-progress" aria-hidden="true">
        <div className="todo-progress-fill" style={{width:`${completionPct}%`}}></div>
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
              <div className="todo-item-main">
                <input
                  className={`todo-input ${todo.completed ? 'checked' : ''}`}
                  value={todo.text}
                  onChange={(event) => updateTodo(todo.id, event.target.value)}
                  placeholder="Todo text"
                />
                <div className="todo-item-status">{todo.completed ? 'Completed' : 'In progress'}</div>
              </div>
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
