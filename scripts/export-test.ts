#!/usr/bin/env node
// Verifies lib/exporters.ts: CSV/SQL/JSON escaping and round-tripping, plus a
// real SQLite read-back of the .db output.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { recordsFromRows, projectsToCsv, projectsToSql, projectsToJson, projectsToSqlite, buildExport, EXPORT_FORMATS } from '../lib/exporters.ts';

let failures = 0;
function assert(name: string, cond: boolean, detail = '') {
  if (cond) console.log(`ok    ${name}`);
  else { console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); failures += 1; }
}

const rows = [
  {
    id: 'p-1', name: 'Plain project', description: 'simple', tags: ['Next.js', 'Tailwind'],
    todos: [{ id: 't-1', text: 'write code', completed: true }, { id: 't-2', text: 'ship it', completed: false }],
    status: 2, project_type: 'software', created_at: '2025-01-02T03:04:05.000Z', updated_at: '2025-02-02T03:04:05.000Z'
  },
  {
    // Hostile characters: quotes, commas, newlines, semicolons, apostrophes.
    id: 'p-2', name: 'Comma, "quote" and\nnewline', description: "it's a 'test'; drop table projects;--",
    tags: ['a,b', 'c"d'], todos: [{ id: 't-3', text: 'with, comma', completed: false }],
    status: 9, project_type: 'business', created_at: '', updated_at: ''
  },
  { id: 'p-3', name: '', description: '', tags: [], todos: [], status: 0, project_type: 'software', created_at: '2025-03-01', updated_at: '2025-03-01' },
  { id: 'p-4', name: 'Unicode 🗑️ ünï', description: 'héllo', tags: ['ünïcode'], todos: [], status: 1, project_type: 'business', created_at: '2025-04-01', updated_at: '2025-04-01' }
];
const records = recordsFromRows(rows, 'user-42');

assert('normalises rows', records.length === 4);
assert('keeps tags array', JSON.stringify(records[0].tags) === '["Next.js","Tailwind"]');
assert('keeps todos', records[0].todos.length === 2);
assert('falls back to user id', records[0].userId === 'user-42');
// Business has 5 columns, so status 9 clamps to the last one.
assert('clamps out-of-range status', projectsToCsv(records).includes('🗑️ Bin'));
assert('rejects non-array input', recordsFromRows(null as any).length === 0);
assert('drops rows without id', recordsFromRows([{ name: 'no id' }]).length === 0);
assert('drops blank todo text', recordsFromRows([{ id: 'a', todos: [{ text: '  ' }] }])[0].todos.length === 0);
assert('rejects a bad format', (() => { try { buildExport('bogus' as any, records); return false; } catch { return true; } })());

/* ---------- CSV ---------- */
const csv = projectsToCsv(records);
assert('csv header', csv.startsWith('id,name,description,tags,status,status_label,project_type,created_at,updated_at,todo_total,todo_completed,todos\n'));
// A field containing a real newline spans two physical lines, so count logical
// records with a real CSV reader rather than by splitting on '\n'.
assert('csv quotes embedded quotes', csv.includes('""quote""'));
assert('csv quotes newline field', csv.includes('"Comma, ""quote"" and\nnewline"'));
assert('csv quotes comma in tags', csv.includes('"a,b, c""d"'));
assert('csv encodes unicode raw', csv.includes('héllo'));
assert('csv ends with newline', csv.endsWith('\n'));

// Round-trip through Python's csv module to prove the escaping is valid.
writeFileSync('/tmp/export-check.csv', csv);
const parsed = JSON.parse(execFileSync('python3', ['-c', `
import csv, json
rows = list(csv.DictReader(open('/tmp/export-check.csv', newline='', encoding='utf-8')))
print(json.dumps([{k: r[k] for k in ('id','name','description','tags','todos')} for r in rows], ensure_ascii=False))
`], { encoding: 'utf8' }));
assert('csv row count', parsed.length === 4, `got ${parsed.length}`);
assert('csv parses in a real reader', parsed.length === 4, JSON.stringify(parsed));
assert('csv name round-trips', parsed[1].name === rows[1].name, JSON.stringify(parsed[1]));
assert('csv description round-trips', parsed[1].description === rows[1].description);
assert('csv todo packing round-trips', parsed[0].todos === '[x] write code; [ ] ship it');

/* ---------- SQL ---------- */
const sql = projectsToSql(records);
assert('sql has begin/commit', sql.includes('begin;') && sql.trimEnd().endsWith('commit;'));
assert('sql creates table', sql.includes('create table if not exists projects'));
assert('sql doubles single quotes', sql.includes("'it''s a ''test''; drop table projects;--'"));
// The array must not be wrapped in quotes a second time.
assert('sql tags as bare array', sql.includes("array['a,b', 'c\"d']"));
assert('sql array not double quoted', !sql.includes(`'array[`));
assert('sql todos as json string', sql.includes('"[{\\"id\\":\\"t-1\\"') || sql.includes('completed'));
assert('sql null for empty description', sql.includes(', null,'));
assert('sql omits blank timestamps', sql.includes("null, null)"));
assert('sql one insert for 4 rows', (sql.match(/insert into projects/g) || []).length === 1);
assert('sql has 4 value tuples', (sql.match(/^  \(/gm) || []).length === 4);

/* ---------- SQL value structure ---------- */
// Build each expected tuple directly from the source data, independently of the
// implementation. An exact match proves the whole row survived as ONE tuple:
// a stray comma or unbalanced quote would shift a column and fail here.
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const expectedTuples = records.map((r) => `  (${[
  q(r.id),
  q(r.name),
  r.description ? q(r.description) : 'null',
  r.userId ? q(r.userId) : 'null',
  `array[${r.tags.map(q).join(', ')}]`,
  q(JSON.stringify(r.todos)),
  String(r.status),
  q(r.projectType),
  r.createdAt ? q(r.createdAt) : 'null',
  r.updatedAt ? q(r.updatedAt) : 'null'
].join(', ')})`);

// Slice from the first tuple to the closing semicolon, then split on the
// indentation that starts each subsequent tuple.
const valuesIdx = sql.indexOf('\n  (');
const insertBody = sql.slice(valuesIdx, sql.indexOf(';', sql.lastIndexOf(')')));
const actualTuples = insertBody.trim().split(/\n(?=  \()/).map((t) => `  ${t.trim().replace(/,$/, '')}`);

assert('tuple count matches rows', actualTuples.length === records.length, `${actualTuples.length} vs ${records.length}`);
expectedTuples.forEach((expected, i) => {
  assert(`tuple ${i} matches source exactly`, actualTuples[i] === expected,
    `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actualTuples[i])}`);
});
assert('injection attempt is inert', insertBody.includes(q("it's a 'test'; drop table projects;--")));
assert('newline stays inside its value', insertBody.includes(q('Comma, "quote" and\nnewline')));
assert('todos json is one value', insertBody.includes(q(JSON.stringify(records[0].todos))));
assert('apostrophe doubled in description', sql.includes("'it''s a ''test''; drop table projects;--'"));
assert('no unescaped stray quote', (() => {
  let inStr = false;
  for (const line of insertBody.split('\n')) {
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "'" && inStr && line[i + 1] === "'") { i += 1; continue; }
      if (line[i] === "'") inStr = !inStr;
    }
  }
  return !inStr;
})());

/* ---------- JSON ---------- */
const json = JSON.parse(projectsToJson(records));
assert('json count', json.count === 4);
assert('json projects length', json.projects.length === 4);
assert('json has statusLabel', json.projects[0].statusLabel === 'Uploading / Deploying');
assert('json round-trips name', json.projects[1].name === rows[1].name);

/* ---------- SQLite ---------- */
const db = projectsToSqlite(records);
writeFileSync('/tmp/export-check.db', db);
const sq = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3, json
con = sqlite3.connect("/tmp/export-check.db")
con.row_factory = sqlite3.Row
out = {
  "integrity": con.execute("PRAGMA integrity_check").fetchone()[0],
  "tables": [r[0] for r in con.execute("select name from sqlite_master where type='table' order by name")],
  "projects": [dict(r) for r in con.execute("select * from projects order by rowid")],
  "todos": [dict(r) for r in con.execute("select * from todos order by rowid")],
  "join": [dict(r) for r in con.execute("select p.name, t.text, t.completed, t.position from projects p join todos t on t.project_id=p.id order by t.rowid")]
}
print(json.dumps(out, ensure_ascii=False))
`], { encoding: 'utf8' }));

assert('db integrity ok', sq.integrity === 'ok', sq.integrity);
assert('db has both tables', JSON.stringify(sq.tables) === '["projects","todos"]', JSON.stringify(sq.tables));
assert('db project count', sq.projects.length === 4);
assert('db todo count', sq.todos.length === 3, `${sq.todos.length}`);
assert('db unicode survives', sq.projects[3].name === 'Unicode 🗑️ ünï', JSON.stringify(sq.projects[3]));
assert('db quotes survive', sq.projects[1].description === "it's a 'test'; drop table projects;--");
assert('db tags stored as json', sq.projects[0].tags === '["Next.js","Tailwind"]');
assert('db null description kept', sq.projects[2].description === null);
assert('db status label resolved', sq.projects[1].status_label === '🗑️ Bin');
assert('db todos join to projects', sq.join.length === 3 && sq.join[0].text === 'write code');
assert('db completed is int', sq.todos[0].completed === 1);
assert('db todo position preserved', sq.join[1].position === 1);

/* ---------- empty + buildExport ---------- */
const emptyDb = projectsToSqlite([]);
writeFileSync('/tmp/export-empty.db', emptyDb);
const emptySq = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3, json
con = sqlite3.connect("/tmp/export-empty.db")
print(json.dumps({"i": con.execute("PRAGMA integrity_check").fetchone()[0],
  "n": con.execute("select count(*) from projects").fetchone()[0]}))
`], { encoding: 'utf8' }));
assert('empty db valid', emptySq.i === 'ok' && emptySq.n === 0, JSON.stringify(emptySq));
assert('empty csv is header only', projectsToCsv([]).trim() === projectsToCsv([]).split('\n')[0]);
assert('empty sql commits', projectsToSql([]).trimEnd().endsWith('commit;'));
assert('empty json count 0', JSON.parse(projectsToJson([])).count === 0);

const fixedNow = new Date('2025-05-06T07:08:09Z');
for (const f of EXPORT_FORMATS) {
  const { blob, filename } = buildExport(f.id, records, fixedNow);
  assert(`buildExport ${f.id} -> .${f.extension}`, filename === `projectboard-2025-05-06-07-08-09.${f.extension}`, filename);
  assert(`buildExport ${f.id} blob type`, blob.type === f.mime, blob.type);
  assert(`buildExport ${f.id} non-empty`, blob.size > 0, `${blob.size}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall exporter checks passed');
if (failures) process.exitCode = 1;
