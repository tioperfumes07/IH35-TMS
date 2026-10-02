#!/usr/bin/env node
/**
 * CURSOR independent engine audit — same population + nine checks as CC-1 METHOD sheet.
 * Population: apps/backend/src engine files (.service/.cron/.worker/.job/.engine).ts excl tests
 * Reachability: resolve relative imports across backend, STRIP .js extension.
 * Nine checks: A-SPINE B-ATOMIC C-SCOPE D-ATOMIC E-SCOPE F-RETRY G-SILENT H-ORPHAN/TESTONLY I-HEADER
 * NO production writes. Output: artifacts/engine-audit-632/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'apps/backend/src');
const OUT = path.join(ROOT, 'artifacts/engine-audit-632');
fs.mkdirSync(OUT, { recursive: true });

const ENGINE_RE = /\.(service|cron|worker|job|engine)\.ts$/;
const TYPE_RE = /\.(service|cron|worker|job|engine)\.ts$/;
const STAMPS = [
  'load_id','driver_id','unit_id','trailer_id','customer_id','vendor_id',
  'settlement_id','invoice_id','journal_entry_id','item_id','bill_id','operating_company_id',
];
// Method sheet says 12 linkage identifiers — match common set used in workbook
const STAMP12 = [
  'load_id','driver_id','unit_id','trailer_id','customer_id','vendor_id',
  'settlement_id','invoice_id','journal_entry_id','item_id','bill_id','work_order_id',
];

function walk(dir, acc=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, acc);
    } else if (ent.isFile() && ent.name.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

function relSrc(abs) {
  return path.relative(SRC, abs).split(path.sep).join('/');
}

const allTs = walk(SRC);
const engines = allTs.filter(p => {
  const base = path.basename(p);
  if (!ENGINE_RE.test(base)) return false;
  if (base.includes('.test.')) return false;
  if (p.includes(`${path.sep}__tests__${path.sep}`)) return false;
  return true;
}).sort();

// ---- import graph (STRIP .js) ----
const IMPORT_RE = /from\s+['"](\.[^'"]+)['"]/g;
const DYN_RE = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function resolveImport(fromFile, spec) {
  let cleaned = spec.replace(/\.js$/, '').replace(/\.ts$/, '');
  const base = path.resolve(path.dirname(fromFile), cleaned);
  const candidates = [
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    base, // already has extension?
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  }
  return null;
}

const prodImporters = new Map(); // abs -> Set of abs that import it (prod)
const testImporters = new Map();

function isTestFile(p) {
  const b = path.basename(p);
  return b.includes('.test.') || b.includes('.spec.') || p.includes(`${path.sep}__tests__${path.sep}`) || p.includes(`${path.sep}test${path.sep}`) || p.includes(`${path.sep}tests${path.sep}`);
}

for (const file of allTs) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const specs = [];
  for (const re of [IMPORT_RE, DYN_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) specs.push(m[1]);
  }
  const bucket = isTestFile(file) ? testImporters : prodImporters;
  for (const spec of specs) {
    const resolved = resolveImport(file, spec);
    if (!resolved) continue;
    if (!bucket.has(resolved)) bucket.set(resolved, new Set());
    bucket.get(resolved).add(file);
  }
}

function moneyWrites(text) {
  return /INSERT\s+INTO\s+accounting\.(journal_entries|journal_entry_postings)\b/i.test(text);
}

function extractTables(text, kind) {
  const tables = new Set();
  let re;
  if (kind === 'INSERT') re = /INSERT\s+INTO\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  else if (kind === 'UPDATE') re = /UPDATE\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  else re = /DELETE\s+FROM\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(text))) tables.add(m[1].toLowerCase());
  return [...tables];
}

function hasTxnBoundary(text) {
  return /\bBEGIN\b|withTransaction|withLuciaBypass|\.transaction\s*\(/i.test(text);
}

function mentionsSchedule(text) {
  // METHOD sheet B10: "mentions cron, schedule, setInterval or worker" — substring, not word-bound.
  // Known FP: fee_schedule / scheduled_arrival / worker in a comment. Confirm against live scheduler.
  return /cron|schedule|setInterval|worker/i.test(text);
}

function hasIdempotency(text) {
  return /ON\s+CONFLICT|idempotenc|WHERE\s+NOT\s+EXISTS/i.test(text);
}

function hasReverse(text) {
  return /\brevers(e|al|ing|ed)\b/i.test(text);
}

function stampsIn(text) {
  const present = STAMP12.filter(s => new RegExp(`\\b${s}\\b`).test(text));
  return present;
}

function leadingHeader(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && /^\s*$/.test(lines[i])) i++;
  if (i >= lines.length) return null;
  if (/^\s*\/\*/.test(lines[i])) {
    const buf = [];
    for (; i < lines.length; i++) {
      buf.push(lines[i]);
      if (/\*\//.test(lines[i])) break;
    }
    return buf.join('\n').replace(/^\/\*+|\*+\/$/g,'').replace(/^\s*\*\s?/gm,'').trim().slice(0, 200);
  }
  if (/^\s*\/\//.test(lines[i])) {
    const buf = [];
    while (i < lines.length && /^\s*\/\//.test(lines[i])) {
      buf.push(lines[i].replace(/^\s*\/\/\s?/, ''));
      i++;
    }
    return buf.join(' ').trim().slice(0, 200);
  }
  return null;
}

function emptyCatch(text) {
  // empty catch that discards — catch (...) { } or catch { } with only whitespace/comments
  return /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*\}/.test(text);
}

function updateDeleteUnscoped(text) {
  // C/E-SCOPE: UPDATE/DELETE whose first ~1400 chars contain no operating_company_id.
  // Require schema.table (or DELETE FROM schema.table). Skip ON CONFLICT DO UPDATE SET.
  const hits = [];
  const re = /\b(UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    // Ignore "DO UPDATE" upsert arms — they are not standalone statements.
    const prefix = text.slice(Math.max(0, start - 12), start).toUpperCase();
    if (/\bDO\s+$/.test(prefix)) continue;
    const window = text.slice(start, start + 1400);
    const semi = window.search(/;/);
    const stmt = semi >= 0 ? window.slice(0, semi) : window;
    if (!/operating_company_id/i.test(stmt)) {
      hits.push({
        kind: m[1].toUpperCase().startsWith("DELETE") ? "DELETE" : "UPDATE",
        table: m[2],
        preview: stmt.replace(/\s+/g, " ").slice(0, 160),
      });
    }
  }
  return hits;
}

const rows = [];
for (const abs of engines) {
  const rel = relSrc(abs);
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const typeM = rel.match(TYPE_RE);
  const type = typeM ? typeM[0].replace(/\.ts$/, '') : '?';
  const module = rel.split('/')[0];
  const prod = prodImporters.get(abs)?.size ?? 0;
  const test = testImporters.get(abs)?.size ?? 0;
  let status;
  if (prod > 0) status = 'WIRED';
  else if (test > 0) status = 'TEST-ONLY';
  else status = 'ORPHAN';

  const isWriter = /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i.test(text);
  const isMoney = moneyWrites(text);
  const inserts = extractTables(text, 'INSERT');
  const updates = extractTables(text, 'UPDATE');
  const deletes = extractTables(text, 'DELETE');
  const tables = [...new Set([...inserts, ...updates, ...deletes])];
  const scheduled = mentionsSchedule(text);
  const reverse = hasReverse(text);
  const stamps = stampsIn(text);
  const header = leadingHeader(text);
  const unscoped = updateDeleteUnscoped(text);
  const txn = hasTxnBoundary(text);
  const multiTableWrite = tables.length >= 2 && isWriter;
  const idem = hasIdempotency(text);
  const silent = emptyCatch(text);

  // Nine checks
  const A_SPINE = isMoney && !/writeTransactionSourceLink|transaction_source_links/i.test(text);
  const B_ATOMIC = isMoney && multiTableWrite && !txn;
  const C_SCOPE = isMoney && unscoped.length > 0;
  const D_ATOMIC = !isMoney && multiTableWrite && !txn;
  const E_SCOPE = !isMoney && unscoped.length > 0;
  const F_RETRY = scheduled && isWriter && !idem;
  const G_SILENT = silent;
  const H = status; // ORPHAN / TEST-ONLY / WIRED
  const I_HEADER = !header;

  let verdict = 'OK';
  const defects = [];
  if (A_SPINE) defects.push('A-SPINE: JE write without transaction_source_links');
  if (B_ATOMIC) defects.push('B-ATOMIC: money multi-table write without txn boundary');
  if (C_SCOPE) defects.push(`C-SCOPE: unscoped money UPDATE/DELETE (${unscoped.length})`);
  if (D_ATOMIC) defects.push('D-ATOMIC: multi-table write without txn boundary');
  if (E_SCOPE) defects.push(`E-SCOPE: unscoped UPDATE/DELETE (${unscoped.length})`);
  if (F_RETRY) defects.push('F-RETRY: scheduled writer without ON CONFLICT/idempotency/WHERE NOT EXISTS');
  if (G_SILENT) defects.push('G-SILENT: empty catch');
  if (status === 'ORPHAN') defects.push('H-ORPHAN');
  if (status === 'TEST-ONLY') defects.push('H-TESTONLY');
  if (I_HEADER) defects.push('I-HEADER: no leading comment');
  // I-HEADER alone is not a hard DEFECT for verdict? Method treats it as a finding class.
  // Verdict: DEFECT if A-G or confirmed H issues that matter; I-HEADER alone = OK with flag
  const hard = defects.filter(d => !d.startsWith('I-HEADER') && !d.startsWith('H-TESTONLY'));
  // H-ORPHAN is a finding; treat as DEFECT for register
  if (hard.length) verdict = 'DEFECT: ' + hard.join('; ');
  else if (I_HEADER && defects.length === 1) verdict = 'OK (I-HEADER only)';
  else if (status === 'TEST-ONLY' && defects.every(d => d.startsWith('H-TESTONLY') || d.startsWith('I-HEADER')))
    verdict = 'OK (TEST-ONLY)';
  else verdict = 'OK';

  rows.push({
    rel, module, type, lines, status, prod, test,
    isWriter: isWriter ? 'YES' : 'NO',
    isMoney: isMoney ? 'YES' : 'NO',
    tables: tables.join(','),
    inserts: inserts.length, updates: updates.length, deletes: deletes.length,
    scheduled: scheduled ? 'YES' : 'NO',
    reverse: reverse ? 'YES' : 'NO',
    stamps: `${stamps.length}/12`,
    stampsMissing: STAMP12.filter(s => !stamps.includes(s)).join(','),
    purpose: header || '— no header comment in the file —',
    A_SPINE: A_SPINE ? 'FLAG' : 'ok',
    B_ATOMIC: B_ATOMIC ? 'FLAG' : 'ok',
    C_SCOPE: C_SCOPE ? 'FLAG' : 'ok',
    D_ATOMIC: D_ATOMIC ? 'FLAG' : 'ok',
    E_SCOPE: E_SCOPE ? 'FLAG' : 'ok',
    F_RETRY: F_RETRY ? 'FLAG' : 'ok',
    G_SILENT: G_SILENT ? 'FLAG' : 'ok',
    H_STATUS: status,
    I_HEADER: I_HEADER ? 'FLAG' : 'ok',
    unscopedPreview: unscoped.slice(0,2).map(u => `${u.kind} ${u.table}: ${u.preview}`).join(' || '),
    verdict,
  });
}

// Counts
const writers = rows.filter(r => r.isWriter === 'YES');
const readOnly = rows.filter(r => r.isWriter === 'NO');
const money = rows.filter(r => r.isMoney === 'YES');
const wired = rows.filter(r => r.status === 'WIRED');
const orphan = rows.filter(r => r.status === 'ORPHAN');
const testOnly = rows.filter(r => r.status === 'TEST-ONLY');
const testCovered = rows.filter(r => r.test > 0);
const noHeader = writers.filter(r => r.I_HEADER === 'FLAG');
const fRetry = rows.filter(r => r.F_RETRY === 'FLAG');

const byType = {};
for (const r of rows) byType[r.type] = (byType[r.type]||0)+1;

const summary = {
  measured_at: new Date().toISOString(),
  tip_sha: null,
  population: rows.length,
  by_type: byType,
  writers: writers.length,
  read_only: readOnly.length,
  money_writers: money.length,
  wired: wired.length,
  orphan: orphan.length,
  test_only: testOnly.length,
  test_covered: testCovered.length,
  writers_no_header: noHeader.length,
  f_retry_candidates: fRetry.length,
  flags: {
    A_SPINE: rows.filter(r=>r.A_SPINE==='FLAG').length,
    B_ATOMIC: rows.filter(r=>r.B_ATOMIC==='FLAG').length,
    C_SCOPE: rows.filter(r=>r.C_SCOPE==='FLAG').length,
    D_ATOMIC: rows.filter(r=>r.D_ATOMIC==='FLAG').length,
    E_SCOPE: rows.filter(r=>r.E_SCOPE==='FLAG').length,
    F_RETRY: fRetry.length,
    G_SILENT: rows.filter(r=>r.G_SILENT==='FLAG').length,
    I_HEADER: rows.filter(r=>r.I_HEADER==='FLAG').length,
  },
};

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

const cols = Object.keys(rows[0]);
const esc = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
};
const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
fs.writeFileSync(path.join(OUT, 'engines-632.csv'), csv);

// F-RETRY list
fs.writeFileSync(path.join(OUT, 'f-retry-candidates.csv'),
  ['rel,tables,inserts,updates,deletes,verdict'].join(',') + '\n' +
  fRetry.map(r => [r.rel, esc(r.tables), r.inserts, r.updates, r.deletes, esc(r.verdict)].join(',')).join('\n')
);

// Verdict lines file (one per engine)
fs.writeFileSync(path.join(OUT, 'verdicts-all.txt'),
  rows.map((r,i) => `${i+1}\t${r.rel}\t${r.status}\tW=${r.isWriter}\tM=${r.isMoney}\tA=${r.A_SPINE}\tB=${r.B_ATOMIC}\tC=${r.C_SCOPE}\tD=${r.D_ATOMIC}\tE=${r.E_SCOPE}\tF=${r.F_RETRY}\tG=${r.G_SILENT}\tH=${r.H_STATUS}\tI=${r.I_HEADER}\t${r.verdict}`).join('\n')
);

console.log(JSON.stringify(summary, null, 2));
console.log('Wrote', OUT);
console.log('F-RETRY sample (top by table count):');
[...fRetry].sort((a,b)=>b.tables.split(',').filter(Boolean).length - a.tables.split(',').filter(Boolean).length)
  .slice(0,15)
  .forEach(r => console.log(`  ${r.tables.split(',').filter(Boolean).length}\t${r.rel}`));
