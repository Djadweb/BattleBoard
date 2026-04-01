import React from 'react';

export type TodoItem = {
  id: string;
  text: string;
  completed: boolean;
};

export type Project = {
  id: string;
  name: string;
  desc?: string;
  tags?: string[];
  todos: TodoItem[];
  status: number;
  date: string;
  projectType: 'software' | 'business';
};

export default function ProjectCard({ project, onEdit, onDelete, onOpen, dragging }: { project: Project; onEdit: (id: string) => void; onDelete: (id: string) => void; onOpen: (id: string) => void; dragging?: boolean; }) {
  const todos = Array.isArray(project.todos) ? project.todos : [];

  function handleOpen() {
    onOpen(project.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  }

  return (
    <article
      className={`card ${dragging ? 'dragging' : ''}`}
      draggable={true}
      data-id={project.id}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="card-top">
        <div>
          <div className="card-title">{project.name}</div>
          <div className={`project-type-badge ${project.projectType}`}>{project.projectType === 'software' ? 'Software' : 'Business'}</div>
        </div>
        <button className="card-menu-btn" onClick={(event) => { event.stopPropagation(); onEdit(project.id); }} title="Edit">✎</button>
      </div>
      {project.desc ? <div className="card-desc">{project.desc}</div> : null}
      {project.tags && project.tags.length ? (
        <div className="card-tags">{project.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      ) : null}
      {todos.length ? (
        <div className="card-todo-summary">
          {todos.filter((todo) => todo.completed).length}/{todos.length} todos done
        </div>
      ) : null}
      <div className="card-footer">
        <span className="card-date">{new Date(project.date).toLocaleDateString()}</span>
        <div className="card-actions">
          <button className="action-btn" onClick={(event) => { event.stopPropagation(); onEdit(project.id); }} title="Edit">✎</button>
          <button className="action-btn danger" onClick={(event) => { event.stopPropagation(); onDelete(project.id); }} title="Delete">✕</button>
        </div>
      </div>
    </article>
  );
}
