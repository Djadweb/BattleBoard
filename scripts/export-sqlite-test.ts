#!/usr/bin/env node
// Verifies lib/sqlite.ts output with the real SQLite library (via python3).
// Covers: empty tables, all value types, integer width boundaries, overflow pages,
// multi-page b-trees, interior page keys, multiple tables, and rowid ordering.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildSqliteDatabase } from '../lib/sqlite.ts';

const outDir = new URL('./.export-test/', import.meta.url).pathname;
execFileSync('mkdir', ['-p', outDir]);

let failures = 0;

function check(name: string, db: Uint8Array, expected: Record<string, Record<string, unknown>[]>) {
  const file = `${outDir}${name}.db`;
  writeFileSync(file, db);

  const probe = `
import sqlite3, json
con = sqlite3.connect("${file}")
con.row_factory = sqlite3.Row
out = {}
out["integrity"] = con.execute("PRAGMA integrity_check").fetchone()[0]
out["tables"] = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
for t in out["tables"]:
    out[t] = [dict(r) for r in con.execute("SELECT * FROM " + t)]
print(json.dumps(out, ensure_ascii=False))
`;

  let got: any;
  try {
    got = JSON.parse(execFileSync('python3', ['-c', probe], { encoding: 'utf8' }));
  } catch (e: any) {
    console.log(`FAIL  ${name}: sqlite could not read the file`);
    console.log(`        ${(e.stderr || '').toString().trim().split('\n').pop()}`);
    failures += 1;
    return;
  }

  const problems: string[] = [];
  if (got.integrity !== 'ok') problems.push(`integrity_check = ${got.integrity}`);
  for (const [table, rows] of Object.entries(expected)) {
    const actual = got[table];
    if (actual === undefined) { problems.push(`missing table ${table}`); continue; }
    if (actual.length !== rows.length) {
      problems.push(`${table}: expected ${rows.length} rows, got ${actual.length}`);
      continue;
    }
    for (let i = 0; i < rows.length; i++) {
      for (const [k, v] of Object.entries(rows[i])) {
        if (JSON.stringify(actual[i][k]) !== JSON.stringify(v)) {
          problems.push(`${table}[${i}].${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[i][k])}`);
        }
      }
    }
  }

  const size = `${(db.length / 1024).toFixed(1)} KiB, ${db.length / 4096} pages`;
  if (problems.length) {
    console.log(`FAIL  ${name}  (${size})`);
    problems.slice(0, 6).forEach(p => console.log(`        - ${p}`));
    failures += 1;
  } else {
    console.log(`ok    ${name}  (${size}, ${got.integrity})`);
  }
}

// Untyped columns have no affinity, so any value is stored and returned verbatim.
const DDL = 'create table projects (id, name, note)';

check('empty', buildSqliteDatabase([{ name: 'projects', sql: DDL, rows: [] }]), { projects: [] });

check('small', buildSqliteDatabase([{
  name: 'projects', sql: DDL,
  rows: [
    ['a', 'Alpha', null],
    ['b', 'Beta', null],
    [3, 3.5, null],                                    // every integer width + a float
    ['d', "quote's \" and ; -- newline\nhere", null],  // csv/sql hostile characters
    ['e', 'héllo 🗑️ ünïcode', null]                    // utf-8 outside the BMP
  ]
}]), {
  projects: [
    { id: 'a', name: 'Alpha', note: null },
    { id: 'b', name: 'Beta', note: null },
    { id: 3, name: 3.5, note: null },
    { id: 'd', name: "quote's \" and ; -- newline\nhere", note: null },
    { id: 'e', name: 'héllo 🗑️ ünïcode', note: null }
  ]
});

// Boundaries for every signed integer width, plus 0/1 serial-type shortcuts.
const bounds = [-128, 127, -129, 128, 32767, 32768, -8388608, 8388607, 8388608,
                2147483647, -2147483648, 2147483648, 140737488355327, 140737488355328,
                9007199254740991, -9007199254740991, 0, 1, 256, 65535, 65536];
check('int-bounds', buildSqliteDatabase([{
  name: 'projects', sql: DDL,
  rows: bounds.map((v, i) => [`r${i}`, v, null])
}]), { projects: bounds.map((v, i) => ({ id: `r${i}`, name: v, note: null })) });

// A record larger than one page must spill onto an overflow chain.
const huge = 'X'.repeat(60000);
check('overflow', buildSqliteDatabase([{
  name: 'projects', sql: DDL,
  rows: [['small', 'tiny', null], ['huge', huge, null], ['tail', 'after', null]]
}]), {
  projects: [
    { id: 'small', name: 'tiny', note: null },
    { id: 'huge', name: huge, note: null },
    { id: 'tail', name: 'after', note: null }
  ]
});

const many = Array.from({ length: 2000 }, (_, i) => [`id-${i}`, `Project number ${i}`, null]);
check('many-pages', buildSqliteDatabase([{ name: 'projects', sql: DDL, rows: many }]),
  { projects: many.map(([id, name]) => ({ id, name, note: null })) });

check('two-tables', buildSqliteDatabase([
  { name: 'projects', sql: DDL, rows: [['p1', 'One', null], ['p2', 'Two', null]] },
  { name: 'todos', sql: 'create table todos (id, text)', rows: [] }
]), {
  projects: [{ id: 'p1', name: 'One', note: null }, { id: 'p2', name: 'Two', note: null }],
  todos: []
});

// Rowids must be sequential and in key order; this exercises interior page keys.
{
  const rows = Array.from({ length: 5000 }, (_, i) => [`r${i}`, `row ${i}`, null]);
  const file = `${outDir}rowids.db`;
  writeFileSync(file, buildSqliteDatabase([{ name: 'projects', sql: DDL, rows }]));
  const r = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3, json
con = sqlite3.connect("${file}")
got = con.execute("select rowid, id from projects").fetchall()
print(json.dumps({"ok": got == [(i+1, f"r{i}") for i in range(5000)], "n": len(got),
                  "integrity": con.execute("PRAGMA integrity_check").fetchone()[0]}))
`], { encoding: 'utf8' }));
  if (r.ok && r.integrity === 'ok') console.log('ok    rowids     (5000 rows, rowid+order verified, ok)');
  else { console.log(`FAIL  rowids     ${JSON.stringify(r)}`); failures += 1; }
}

// The exact typed schema the app exports, with correctly typed values.
{
  const sql = 'create table projects (\n  id text not null,\n  name text not null,\n  description text,\n  tags text,\n  status integer not null,\n  project_type text not null,\n  created_at text\n)';
  const rows = [
    ['11111111-1111-1111-1111-111111111111', 'Alpha', 'desc "quoted"', '["a","b"]', 0, 'software', '2025-01-01T00:00:00.000Z'],
    ['22222222-2222-2222-2222-222222222222', 'Beta', null, '[]', 5, 'business', '2025-02-01T00:00:00.000Z']
  ];
  const file = `${outDir}typed.db`;
  writeFileSync(file, buildSqliteDatabase([{ name: 'projects', sql, rows }]));
  const r = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3, json
con = sqlite3.connect("${file}")
con.row_factory = sqlite3.Row
rows = [dict(r) for r in con.execute("select * from projects")]
print(json.dumps({"integrity": con.execute("PRAGMA integrity_check").fetchone()[0], "rows": rows}))
`], { encoding: 'utf8' }));
  const want = rows.map(rw => Object.fromEntries(Object.keys(rw === rows[0] ? rw : rows[0]).map((k, i) => [k, (rw as any)[k]])));
  const okRows = JSON.stringify(r.rows) === JSON.stringify(
    rows.map(rw => ({ id: rw[0], name: rw[1], description: rw[2], tags: rw[3], status: rw[4], project_type: rw[5], created_at: rw[6] }))
  );
  if (r.integrity === 'ok' && okRows) console.log('ok    typed-ddl  (real export schema, integrity ok)');
  else { console.log(`FAIL  typed-ddl  integrity=${r.integrity} rows=${JSON.stringify(r.rows)}`); failures += 1; }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall sqlite checks passed');
if (failures) process.exitCode = 1;
