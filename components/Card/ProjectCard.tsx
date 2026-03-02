import React from 'react';

export type Project = {
  id: string;
  name: string;
  desc?: string;
  tags?: string[];
  status: number;
  date: string;
};

export default function ProjectCard({ project, onEdit, onDelete, dragging }: { project: Project; onEdit: (id: string) => void; onDelete: (id: string) => void; dragging?: boolean; }) {
  return (
    <article className={`card ${dragging ? 'dragging' : ''}`} draggable={true} data-id={project.id}>
      <div className="card-top">
        <div className="card-title">{project.name}</div>
        <button className="card-menu-btn" onClick={() => onEdit(project.id)} title="Edit">✎</button>
      </div>
      {project.desc ? <div className="card-desc">{project.desc}</div> : null}
      {project.tags && project.tags.length ? (
        <div className="card-tags">{project.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
      ) : null}
      <div className="card-footer">
        <span className="card-date">{new Date(project.date).toLocaleDateString()}</span>
        <div className="card-actions">
          <button className="action-btn" onClick={() => onEdit(project.id)} title="Edit">✎</button>
          <button className="action-btn danger" onClick={() => onDelete(project.id)} title="Delete">✕</button>
        </div>
      </div>
    </article>
  );
}

