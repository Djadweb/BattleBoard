import { buildSqliteDatabase, type SqlValue } from './sqlite';
import { statusLabelFor, type ProjectType } from './projectColumns';

export type ExportTodo = {
  id: string;
  text: string;
  completed: boolean;
};

export type ExportRecord = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  todos: ExportTodo[];
  status: number;
  projectType: ProjectType;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
};

export type ExportFormat = 'csv' | 'sql' | 'sqlite' | 'json';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function todoArray(value: unknown): ExportTodo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      id: str(item?.id) || Math.random().toString(36).slice(2, 10),
      text: str(item?.text).trim(),
      completed: Boolean(item?.completed)
    }))
    .filter((todo) => todo.text.length > 0);
}

/**
 * Normalise database rows or in-memory projects into one export shape.
 * Accepts both the Supabase row shape (snake_case) and the local Project shape
 * (camelCase) so the exporter works whether or not the database read succeeded.
 */
export function recordsFromRows(rows: unknown[], userId: string | null = null): ExportRecord[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row: any): ExportRecord | null => {
      if (!row || typeof row !== 'object') return null;
      const createdAt = str(row.created_at) || str(row.date);
      return {
        id: str(row.id),
        name: str(row.name),
        description: str(row.description) || str(row.desc),
        tags: strArray(row.tags),
        todos: todoArray(row.todos),
        status: num(row.status),
        projectType: (row.project_type ?? row.projectType) === 'business' ? 'business' : 'software',
        createdAt,
        updatedAt: str(row.updated_at) || createdAt,
        userId: str(row.user_id) || userId
      };
    })
    .filter((record): record is ExportRecord => Boolean(record?.id));
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

const CSV_COLUMNS = [
  'id', 'name', 'description', 'tags', 'status', 'status_label',
  'project_type', 'created_at', 'updated_at', 'todo_total',
  'todo_completed', 'todos'
] as const;

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function packTodos(todos: ExportTodo[]): string {
  return todos.map((todo) => `${todo.completed ? '[x]' : '[ ]'} ${todo.text}`).join('; ');
}

export function projectsToCsv(records: ExportRecord[]): string {
  const lines = [CSV_COLUMNS.join(',')];

  records.forEach((record) => {
    const row: Record<(typeof CSV_COLUMNS)[number], string | number> = {
      id: record.id,
      name: record.name,
      description: record.description,
      tags: record.tags.join(', '),
      status: record.status,
      status_label: statusLabelFor(record.status, record.projectType),
      project_type: record.projectType,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      todo_total: record.todos.length,
      todo_completed: record.todos.filter((todo) => todo.completed).length,
      todos: packTodos(record.todos)
    };
    lines.push(CSV_COLUMNS.map((column) => csvCell(String(row[column]))).join(','));
  });

  // Trailing newline: some tools ignore the last row without it.
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

const SQL_DDL = `create table if not exists projects (
  id uuid primary key,
  name text not null,
  description text,
  user_id uuid,
  tags text[],
  todos jsonb,
  status int not null default 0,
  project_type text not null default 'software',
  created_at timestamptz,
  updated_at timestamptz
)`;

const SQL_COLUMNS = [
  'id', 'name', 'description', 'user_id', 'tags', 'todos',
  'status', 'project_type', 'created_at', 'updated_at'
] as const;

/** Postgres standard_conforming_strings is on, so doubling quotes is enough. */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A SQL fragment that is already valid syntax and must not be quoted again. */
type RawSql = { raw: string };

function raw(text: string): RawSql {
  return { raw: text };
}

function isRaw(value: SqlValue | RawSql): value is RawSql {
  return typeof value === 'object' && value !== null && 'raw' in value;
}

function sqlValue(value: SqlValue | RawSql): string {
  if (value === null) return 'null';
  if (isRaw(value)) return value.raw;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return sqlText(value);
  return sqlText(Array.from(value).map((byte) => String.fromCharCode(byte)).join(''));
}

/** A text[] literal. The array is untyped so Postgres applies column affinity. */
function sqlArray(values: string[]): RawSql {
  return raw(`array[${values.map(sqlText).join(', ')}]`);
}

/** A jsonb literal. Unquoted type lets Postgres coerce it to the column type. */
function sqlJson(value: unknown): RawSql {
  return raw(sqlText(JSON.stringify(value)));
}

/** Timestamps only go in when present, otherwise Postgres uses its default. */
function sqlTimestamp(value: string): SqlValue | RawSql {
  return value ? raw(sqlText(value)) : null;
}

const ROWS_PER_INSERT = 50;

export function projectsToSql(records: ExportRecord[]): string {
  const out: string[] = [
    '-- ProjectBoard export',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Projects: ${records.length}`,
    '-- Load with psql, the Supabase SQL editor, or any Postgres client.',
    '-- user_id is exported without a foreign key so this loads outside Supabase.',
    '',
    'begin;',
    '',
    SQL_DDL + ';',
    ''
  ];

  for (let start = 0; start < records.length; start += ROWS_PER_INSERT) {
    const batch = records.slice(start, start + ROWS_PER_INSERT);
    const tuples = batch.map((record) => {
      const values: (SqlValue | RawSql)[] = [
        record.id,
        record.name,
        record.description || null,
        record.userId,
        sqlArray(record.tags),
        sqlJson(record.todos),
        record.status,
        record.projectType,
        sqlTimestamp(record.createdAt),
        sqlTimestamp(record.updatedAt)
      ];
      return `  (${values.map(sqlValue).join(', ')})`;
    });

    out.push(`insert into projects (${SQL_COLUMNS.join(', ')}) values`);
    out.push(`${tuples.join(',\n')};`);
    out.push('');
  }

  if (records.length === 0) out.push('-- No projects to insert.');
  out.push('commit;', '');
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * JSON
 * ------------------------------------------------------------------ */

export function projectsToJson(records: ExportRecord[]): string {
  return `${JSON.stringify(
    {
      format: 'projectboard-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      count: records.length,
      projects: records.map((record) => ({
        id: record.id,
        name: record.name,
        description: record.description,
        tags: record.tags,
        status: record.status,
        statusLabel: statusLabelFor(record.status, record.projectType),
        projectType: record.projectType,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        todos: record.todos
      }))
    },
    null,
    2
  )}\n`;
}

/* ------------------------------------------------------------------ *
 * SQLite
 * ------------------------------------------------------------------ */

const SQLITE_PROJECTS_DDL = `create table projects (
  id text not null,
  name text not null,
  description text,
  tags text,
  status integer not null,
  status_label text not null,
  project_type text not null,
  created_at text,
  updated_at text
)`;

const SQLITE_TODOS_DDL = `create table todos (
  id text not null,
  project_id text not null,
  text text not null,
  completed integer not null,
  position integer not null
)`;

/** Built into a fresh ArrayBuffer so the result is a valid BlobPart. */
export function projectsToSqlite(records: ExportRecord[]): Uint8Array<ArrayBuffer> {
  const projectRows: SqlValue[][] = records.map((record) => [
    record.id,
    record.name,
    record.description || null,
    JSON.stringify(record.tags),
    record.status,
    statusLabelFor(record.status, record.projectType),
    record.projectType,
    record.createdAt || null,
    record.updatedAt || null
  ]);

  const todoRows: SqlValue[][] = [];
  records.forEach((record) => {
    record.todos.forEach((todo, position) => {
      todoRows.push([todo.id, record.id, todo.text, todo.completed ? 1 : 0, position]);
    });
  });

  return buildSqliteDatabase([
    { name: 'projects', sql: SQLITE_PROJECTS_DDL, rows: projectRows },
    { name: 'todos', sql: SQLITE_TODOS_DDL, rows: todoRows }
  ]);
}

/* ------------------------------------------------------------------ *
 * Unified entry point
 * ------------------------------------------------------------------ */

export type ExportFormatInfo = {
  id: ExportFormat;
  label: string;
  extension: string;
  mime: string;
  description: string;
};

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  { id: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv;charset=utf-8', description: 'One row per project, for spreadsheets.' },
  { id: 'sql', label: 'SQL', extension: 'sql', mime: 'application/sql;charset=utf-8', description: 'Replayable Postgres insert statements.' },
  { id: 'sqlite', label: 'SQLite', extension: 'db', mime: 'application/vnd.sqlite3', description: 'A real .db file with projects and todos tables.' },
  { id: 'json', label: 'JSON', extension: 'json', mime: 'application/json;charset=utf-8', description: 'Full-fidelity backup of every field.' }
];

export type ExportPayload = {
  blob: Blob;
  filename: string;
};

export function buildExport(format: ExportFormat, records: ExportRecord[], now = new Date()): ExportPayload {
  const info = EXPORT_FORMATS.find((entry) => entry.id === format);
  if (!info) throw new Error(`Unknown export format: ${format}`);

  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `projectboard-${stamp}.${info.extension}`;

  if (format === 'sqlite') {
    return { blob: new Blob([projectsToSqlite(records)], { type: info.mime }), filename };
  }

  const text =
    format === 'csv' ? projectsToCsv(records)
    : format === 'sql' ? projectsToSql(records)
    : projectsToJson(records);

  return { blob: new Blob([text], { type: info.mime }), filename };
}
