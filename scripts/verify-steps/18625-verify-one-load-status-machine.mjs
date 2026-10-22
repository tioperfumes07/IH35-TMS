#!/usr/bin/env node
/**
 * LEAD 443.211R (10-21 22:58Z) — ONE STATUS MACHINE. Measured on main before this step: eleven backend writers ran their own
 * `UPDATE mdata.loads SET status` (bulk set_status / mark-paid, the mdata PATCH, cancellation + its reversal, abandonment,
 * the Samsara detector, the draft-crew advance + its self-heal cron, the invoice-void revert, the billing tail), each with its
 * own idea of a legal move; the invoice-death trigger stepped a load back to ANY historical status; and nothing walked a
 * closed load back when its invoice's payment was voided.
 * THE RULE:
 *   1. no backend file but dispatch/load-transition.service.ts writes mdata.loads.status, and that file writes it exactly once
 *      (transitionLoadStatus — validated against the machine, compare-and-set);
 *   2. the SQL mirror mdata.load_status_edge_allowed (latest migration defining it) lists EXACTLY loadStatusMachineEdges()
 *      of dispatch/load-state-machine.ts — forward + billing_reverse + cancel_restore;
 *   3. the two SQL writers (invoice death, invoice unsettled) validate their move through that mirror.
 * --selftest plants each regression.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "apps/backend/src";
const WRITER = "apps/backend/src/dispatch/load-transition.service.ts";
const MACHINE = "apps/backend/src/dispatch/load-state-machine.ts";
const MIGRATIONS = "db/migrations";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

function backendFiles() {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "__tests__" && name !== "node_modules") walk(p);
      } else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) out[relative(ROOT, p)] = readFileSync(p, "utf8");
    }
  };
  walk(resolve(ROOT, SRC));
  return out;
}

/** latest definition (by migration file order) of each named SQL function */
function latestSqlFunctions(names) {
  const dir = resolve(ROOT, MIGRATIONS);
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const out = {};
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const n of names) {
      const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${n.replace(".", "\\.")}\\s*\\([\\s\\S]*?\\$(fn|function|\\w*)\\$([\\s\\S]*?)\\$\\1\\$`, "gi");
      for (const m of sql.matchAll(re)) out[n] = { file: `${MIGRATIONS}/${f}`, body: m[2] };
    }
  }
  return out;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/** every `UPDATE mdata.loads … SET …` whose SET list assigns status */
export function statusWrites(src) {
  const code = stripComments(src);
  const hits = [];
  for (const m of code.matchAll(/UPDATE\s+mdata\.loads\b(?:\s+(?:AS\s+)?\w+)?\s+SET\b([\s\S]*?)(?=\bWHERE\b|\bRETURNING\b|\bFROM\b|`|;)/gi))
    if (/(^|[\s,.(])status\s*=/i.test(m[1])) hits.push(m[0].slice(0, 80).replace(/\s+/g, " "));
  return hits;
}

/** parse the machine's literal tables out of load-state-machine.ts (plain object / array literals) */
export function machineEdgesFromSource(src) {
  const lit = (name, open, close) => {
    const i = src.indexOf(`export const ${name}`);
    if (i < 0) return null;
    const start = src.indexOf(open, src.indexOf("=", i));
    let depth = 0;
    for (let j = start; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === close && --depth === 0) return Function(`"use strict"; return (${stripComments(src.slice(start, j + 1))});`)();
    }
    return null;
  };
  const fwd = lit("MDATA_STATUS_TRANSITIONS", "{", "}");
  const rev = lit("BILLING_REVERSE_EDGES", "{", "}");
  const restore = lit("CANCEL_RESTORE_TARGETS", "[", "]");
  if (!fwd || !rev || !restore) return null;
  const edges = [];
  for (const [f, ts] of Object.entries(fwd)) for (const t of ts) edges.push(`${f}>${t}>forward`);
  for (const [f, ts] of Object.entries(rev)) for (const t of ts) edges.push(`${f}>${t}>billing_reverse`);
  for (const t of restore) edges.push(`cancelled>${t}>cancel_restore`);
  return edges;
}

export function sqlMirrorEdges(body) {
  return [...body.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)].map((m) => `${m[1]}>${m[2]}>${m[3]}`);
}

export function check(over = {}) {
  const files = over.files ?? backendFiles();
  const machine = over.machine ?? read(MACHINE);
  const fns = over.fns ?? latestSqlFunctions([
    "mdata.load_status_edge_allowed",
    "accounting.revert_load_on_invoice_death",
    "accounting.rederive_load_on_invoice_unsettled",
  ]);
  const p = [];
  for (const [rel, src] of Object.entries(files)) {
    const w = statusWrites(src);
    if (rel === WRITER) {
      if (w.length !== 1) p.push(`${rel}: must write mdata.loads.status exactly once (transitionLoadStatus) — found ${w.length}`);
      if (!/export async function transitionLoadStatus\([\s\S]*?validateLoadStatusWrite\([\s\S]*?operating_company_id = \$2::uuid AND status::text = \$4/.test(src))
        p.push(`${rel}: transitionLoadStatus must validate against the machine and compare-and-set the status it read, company-scoped`);
    } else for (const h of w) p.push(`${rel}: writes mdata.loads.status outside the one writer — "${h}" (call transitionLoadStatus)`);
  }
  if (!(WRITER in files)) p.push(`${WRITER}: the one writer is missing`);

  const ts = machineEdgesFromSource(machine);
  const mirror = fns["mdata.load_status_edge_allowed"];
  if (!ts) p.push(`${MACHINE}: MDATA_STATUS_TRANSITIONS / BILLING_REVERSE_EDGES / CANCEL_RESTORE_TARGETS not found`);
  if (!mirror) p.push(`${MIGRATIONS}: no migration defines mdata.load_status_edge_allowed (the SQL mirror of the machine)`);
  if (ts && mirror) {
    const sql = sqlMirrorEdges(mirror.body);
    const a = new Set(ts), b = new Set(sql);
    const onlyTs = ts.filter((e) => !b.has(e)), onlySql = sql.filter((e) => !a.has(e));
    if (onlyTs.length || onlySql.length || sql.length !== b.size)
      p.push(`${mirror.file}: SQL mirror drifted from ${MACHINE} — only in TS [${onlyTs.join(", ")}], only in SQL [${onlySql.join(", ")}]${sql.length !== b.size ? ", duplicate rows" : ""}`);
  }
  for (const n of ["accounting.revert_load_on_invoice_death", "accounting.rederive_load_on_invoice_unsettled"]) {
    const f = fns[n];
    if (!f) p.push(`${MIGRATIONS}: ${n} is not defined`);
    else if (!/mdata\.load_status_edge_allowed\(/.test(f.body)) p.push(`${f.file}: ${n} writes a load status without validating it through mdata.load_status_edge_allowed`);
  }
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const files = backendFiles();
  const machine = read(MACHINE);
  const fns = latestSqlFunctions(["mdata.load_status_edge_allowed", "accounting.revert_load_on_invoice_death", "accounting.rederive_load_on_invoice_unsettled"]);
  const base = { files, machine, fns };
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const anyFile = Object.keys(files).find((k) => k !== WRITER && k.includes("/dispatch/"));
  const mirror = fns["mdata.load_status_edge_allowed"];
  const death = fns["accounting.revert_load_on_invoice_death"];
  const plants = [
    ["raw writer in another file", { files: { ...files, [anyFile]: files[anyFile] + "\nconst q = `UPDATE mdata.loads SET status = 'closed' WHERE id = $1`;\n" } }],
    ["aliased multi-line writer", { files: { ...files, [anyFile]: files[anyFile] + "\nconst q = `UPDATE mdata.loads l\n   SET updated_at = now(),\n       status = $2::mdata.load_status_enum\n WHERE l.id = $1`;\n" } }],
    ["second write inside the writer", { files: { ...files, [WRITER]: files[WRITER] + "\nconst q = `UPDATE mdata.loads SET status = 'draft' WHERE id = $1`;\n" } }],
    ["writer stops compare-and-set", { files: { ...files, [WRITER]: files[WRITER].replace("status::text = $4", "true") } }],
    ["writer drops the company bind", { files: { ...files, [WRITER]: files[WRITER].replace("AND operating_company_id = $2::uuid AND status::text = $4", "AND status::text = $4") } }],
    ["TS gains an edge the SQL lacks", { machine: machine.replace('paid: ["closed"],', 'paid: ["closed", "draft"],') }],
    ["SQL gains an edge the TS lacks", { fns: { ...fns, "mdata.load_status_edge_allowed": { ...mirror, body: mirror.body.replace("('draft', 'booked', 'forward'),", "('draft', 'booked', 'forward'),\n    ('closed', 'draft', 'forward'),") } } }],
    ["death trigger reverts blind", { fns: { ...fns, "accounting.revert_load_on_invoice_death": { ...death, body: death.body.replaceAll("mdata.load_status_edge_allowed(", "coalesce(") } } }],
  ];
  for (const [n, over] of plants) {
    const k = Object.keys(over)[0];
    if (JSON.stringify(over[k]) === JSON.stringify(base[k])) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check({ ...base, ...over }).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-one-load-status-machine: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-one-load-status-machine: OK — one writer of mdata.loads.status; the SQL mirror equals the TS machine; both SQL writers validate through it.");
}
