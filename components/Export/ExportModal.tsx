"use client";
import { useCallback, useEffect, useState } from 'react';
import supabase from '../../lib/supabaseClient';
import { buildExport, recordsFromRows, EXPORT_FORMATS, type ExportFormat, type ExportRecord } from '../../lib/exporters';
import { downloadBlob } from '../../lib/download';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; filename: string; count: number } | { kind: 'error'; message: string };

export default function ExportModal({ open, onClose, fallbackProjects, userId }: { open: boolean; onClose: () => void; fallbackProjects: unknown[]; userId: string | null; }) {
  const [records, setRecords] = useState<ExportRecord[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [source, setSource] = useState<'database' | 'local'>('database');

  const load = useCallback(async () => {
    if (!userId) return;
    setStatus({ kind: 'busy' });
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRecords(recordsFromRows(data ?? [], userId));
      setSource('database');
      setStatus({ kind: 'idle' });
    } catch (err: any) {
      // Offline or RLS failure: still let the user export what the board has loaded.
      const local = recordsFromRows(fallbackProjects, userId);
      setRecords(local);
      setSource('local');
      setStatus({ kind: 'idle' });
      console.warn('Export read from database failed, using loaded projects:', err?.message || err);
    }
  }, [userId, fallbackProjects]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) {
      setStatus({ kind: 'idle' });
      setRecords(null);
    }
  }, [open]);

  function runExport(format: ExportFormat) {
    if (!records) return;
    try {
      const { blob, filename } = buildExport(format, records);
      downloadBlob(blob, filename);
      setStatus({ kind: 'done', filename, count: records.length });
    } catch (err: any) {
      setStatus({ kind: 'error', message: err?.message || 'Export failed' });
    }
  }

  if (!open) return null;

  const loading = status.kind === 'busy' || records === null;
  const count = records?.length ?? 0;

  return (
    <div className={`overlay ${open ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-header">
          <div>
            <div className="modal-title" id="export-title">Export projects</div>
            <div className="details-subtitle">
              {loading ? 'Reading your projects…' : `${count} project${count === 1 ? '' : 's'} ready to export`}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close export dialog">✕</button>
        </div>

        {!loading && source === 'local' ? (
          <div className="export-warning">
            Could not read the database, so this exports the projects currently loaded in the board.
          </div>
        ) : null}

        <div className="export-grid">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className="export-option"
              onClick={() => runExport(format.id)}
              disabled={loading || count === 0}
            >
              <div className="export-option-head">
                <span className="export-option-label">{format.label}</span>
                <span className="export-option-ext">.{format.extension}</span>
              </div>
              <div className="export-option-desc">{format.description}</div>
            </button>
          ))}
        </div>

        {count === 0 && !loading ? <div className="export-empty">There is nothing to export yet.</div> : null}

        {status.kind === 'done' ? (
          <div className="export-status ok">Saved {status.filename} ({status.count} projects)</div>
        ) : null}
        {status.kind === 'error' ? <div className="export-status error">{status.message}</div> : null}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
