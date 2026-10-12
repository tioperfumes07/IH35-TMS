#!/usr/bin/env node
/**
 * verify-qbo-paths-never-write-native-tables — ACCT-F4431380 (Lead 443.137 item 9e).
 *
 * OWNER RULING: QuickBooks is a READ-ONLY ARCHIVE. USMCA is entirely the TMS ERP; TRANSPORTATION and
 * TRUCKING are frozen QuickBooks mirrors. A QBO puller / reconciler / bootstrap may write ONLY its own
 * inbound mirror or staging table. It may never INSERT / UPDATE / DELETE / MERGE / TRUNCATE a native
 * money or master table (accounting.bills, bill_lines, bill_payments, invoices, invoice_lines, payments,
 * payment_applications, expenses, expense_lines, vendor_credits, journal_entries, postings, ...,
 * catalogs.accounts, catalogs.items, mdata.customers, mdata.vendors, ...).
 *
 * WHAT WENT WRONG (measured 2026-10-12 on origin/main 31695686ae): seven Stage-2 projections wrote
 * accounting.* money tables from the QBO mirrors, four reconcilers and four master pullers wrote
 * catalogs.accounts / catalogs.items / mdata.customers / mdata.vendors, and the CC bill-payment route
 * stamped a FABRICATED qbo_bill_payment_id onto a native payment and queued a QuickBooks push. The
 * projections were "off" only because a DB flag block made them silently resolve { enabled:false } — the
 * SQL stayed one flag flip (or one skipFlagCheck:true call) away from running, and the scheduler recorded
 * each no-op as a SUCCESSFUL step.
 *
 * RULES (all static; reads the backend source):
 *   R1  Every non-test .ts file in SCOPE writes only allowed targets: a qbo / qbo_sync / qbo_archive schema
 *       table, any table whose name starts with qbo_ (mdata.qbo_*, integrations.qbo_*, accounting.qbo_*),
 *       or the _system / audit log schemas. Any other schema.table write target FAILS. New files under a
 *       scoped directory are covered automatically.
 *   R2  A dynamic write target (`INSERT INTO ${...}` etc.) in SCOPE FAILS unless it is the one reviewed
 *       dynamic site (usmca-carrier-bootstrap copyCatalogTable), whose table list must stay inside a fixed
 *       set of non-QBO operational catalogs copied carrier-to-carrier (never from a qbo_ mirror).
 *   R3  Each former QBO -> native entry point still exists and REFUSES BY NAME (calls refuseQboNativeWrite)
 *       — never a silent "0 rows" no-op a caller reports as success.
 *   R4  sync-scheduler.ts schedules none of the refused entry points (each would record a refused step
 *       every tick).
 *   R5  cc-payment.routes.ts stamps no qbo_* identity onto a native row and queues no `qbo.*` event.
 *
 * Comments are stripped before scanning, so prose that names a table never trips the guard.
 *
 * --selftest copies the REAL scoped files into a temp tree, proves that tree passes, then plants one
 * violation per rule (plus a comment-only near miss that must NOT fail) and requires each to be caught.
 *
 * Registered: runs inside verify-steps 128 (no-qbo-write-path, the QBO architecture lock) — same CI job.
 * LINKAGE: N/A (QBO archive boundary lock). Read-only static scan.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.VERIFY_QBO_NATIVE_ROOT
  ? path.resolve(process.env.VERIFY_QBO_NATIVE_ROOT)
  : path.resolve(__dirname, "..");
const LABEL = "verify-qbo-paths-never-write-native-tables";

/** Directories (recursive) and single files that hold QBO pullers / reconcilers / bootstraps / inbound workers. */
const SCOPE_DIRS = ["apps/backend/src/qbo-sync", "apps/backend/src/qbo-subaccount-setup"];
const SCOPE_FILES = [
  "apps/backend/src/onboarding/usmca-carrier-bootstrap.ts",
  "apps/backend/src/integrations/qbo/sync-inbound.worker.ts",
  "apps/backend/src/integrations/qbo/forensic-import.service.ts",
  "apps/backend/src/integrations/qbo/qbo-cdc.service.ts",
];

const ALLOWED_SCHEMAS = new Set(["qbo", "qbo_sync", "qbo_archive", "_system", "audit"]);
const isAllowedTarget = (schema, table) => ALLOWED_SCHEMAS.has(schema) || /^qbo_/.test(table);

const WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?)\s+(?:ONLY\s+)?"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;
const DYNAMIC_WRITE_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?)\s+\$\{/gi;

/** R2 — the one reviewed dynamic write site and the only tables it may copy. */
const DYNAMIC_SITE = "apps/backend/src/onboarding/usmca-carrier-bootstrap.ts";
const DYNAMIC_ALLOWED_TABLES = new Set([
  "catalogs.complaint_types",
  "catalogs.load_cancellation_reasons",
  "catalogs.dispatch_flag_colors",
]);

/** R3 — former QBO -> native entry points that must refuse by name. */
const REFUSAL_SITES = {
  "apps/backend/src/qbo-sync/ap-bills-puller.ts": ["projectApBillsToLedger", "projectApBillLinesToLedger"],
  "apps/backend/src/qbo-sync/ap-bill-payments-puller.ts": ["projectApBillPaymentsToLedger"],
  "apps/backend/src/qbo-sync/qbo-ar-invoices-puller.ts": ["projectArInvoicesToLedger"],
  "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts": ["projectArPaymentsToLedger"],
  "apps/backend/src/qbo-sync/qbo-purchases-puller.ts": ["projectPurchasesToExpenses"],
  "apps/backend/src/qbo-sync/qbo-vendor-credits-puller.ts": ["projectVendorCreditsToLedger"],
  "apps/backend/src/qbo-sync/chart-of-accounts-reconciler.ts": ["reconcileChartOfAccounts"],
  "apps/backend/src/qbo-sync/customers-reconciler.ts": ["reconcileCustomers"],
  "apps/backend/src/qbo-sync/vendors-reconciler.ts": ["reconcileVendors"],
  "apps/backend/src/qbo-sync/items-reconciler.ts": ["reconcileItems"],
};
const SCHEDULER = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const CC_PAYMENT = "apps/backend/src/bill-payments/cc-payment.routes.ts";
const CC_FORBIDDEN = [
  { re: /\bqbo_[a-z_]*id\s*=\s*\$/i, why: "stamps a qbo_*_id onto a native row" },
  { re: /\bqbo_idempotency_key\s*=/i, why: "stamps a QBO idempotency key onto a native row" },
  { re: /["'`]qbo\.[a-z_.]+["'`]/i, why: "queues a qbo.* outbox event (a QuickBooks push)" },
];

/** Strip JS/TS comments so prose never trips the scan. Template/string contents are kept verbatim. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  let mode = "code"; // code | sq | dq | tpl | line | block
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      out += c; i += 1; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } i += 1; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else { if (c === "\n") out += c; i += 1; } continue; }
    // string-ish
    if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i += 1;
  }
  return out;
}

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;
const isTestFile = (rel) => /(^|\/)__tests__\/|\.test\.ts$|\.spec\.ts$|\.d\.ts$/.test(rel);

function walk(root, relDir, out) {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(relDir, ent.name);
    if (ent.isDirectory()) walk(root, rel, out);
    else if (ent.name.endsWith(".ts") && !isTestFile(rel)) out.push(rel);
  }
}

export function scopedFiles(root) {
  const out = [];
  for (const d of SCOPE_DIRS) walk(root, d, out);
  for (const f of SCOPE_FILES) if (fs.existsSync(path.join(root, f))) out.push(f);
  return [...new Set(out)].sort();
}

/** Body of `export async function name(...)` up to the first column-0 closing brace. */
function functionBody(src, name) {
  const m = new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`, "m").exec(src);
  if (!m) return null;
  const end = src.indexOf("\n}\n", m.index);
  return src.slice(m.index, end === -1 ? undefined : end + 2);
}

export function analyze(root = REPO_ROOT) {
  const failures = [];
  const files = scopedFiles(root);
  if (files.length < 10) failures.push(`scope resolved only ${files.length} files under ${root} — instrument broken (expected the qbo-sync tree)`);

  for (const rel of files) {
    const code = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
    // R1
    for (const m of code.matchAll(WRITE_RE)) {
      const [, verb, schema, table] = m;
      const s = schema.toLowerCase();
      const t = table.toLowerCase();
      if (!isAllowedTarget(s, t)) {
        failures.push(`R1 ${rel}:${lineOf(code, m.index)} — ${verb.replace(/\s+/g, " ").toUpperCase()} ${s}.${t}: a QBO path writes a native table (allowed: qbo/qbo_sync/qbo_archive/_system/audit schemas or a qbo_* mirror table)`);
      }
    }
    // R2
    for (const m of code.matchAll(DYNAMIC_WRITE_RE)) {
      if (rel !== DYNAMIC_SITE) {
        failures.push(`R2 ${rel}:${lineOf(code, m.index)} — dynamic write target \`${m[1]} \${...}\` in a QBO path cannot be proven to avoid native tables`);
      }
    }
    if (rel === DYNAMIC_SITE) {
      const specTables = [...code.matchAll(/\btable:\s*["'`]([a-z_]+\.[a-z_]+)["'`]/g)].map((x) => x[1]);
      if (specTables.length === 0 && DYNAMIC_WRITE_RE.test(code)) {
        failures.push(`R2 ${rel} — dynamic write present but no table: "..." spec list found to verify`);
      }
      DYNAMIC_WRITE_RE.lastIndex = 0;
      for (const t of specTables) {
        if (!DYNAMIC_ALLOWED_TABLES.has(t)) failures.push(`R2 ${rel} — carrier bootstrap copy list includes ${t}, outside the reviewed non-QBO operational catalogs`);
      }
      if (/FROM\s+mdata\.qbo_[a-z_]+[\s\S]{0,400}INSERT\s+INTO\s+\$\{/i.test(code) || /INSERT\s+INTO\s+\$\{[\s\S]{0,400}FROM\s+mdata\.qbo_/i.test(code)) {
        failures.push(`R2 ${rel} — the dynamic catalog copy reads a qbo_ mirror (QBO -> native)`);
      }
    }
  }

  // R3
  for (const [rel, fns] of Object.entries(REFUSAL_SITES)) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { failures.push(`R3 ${rel} missing — the refusal entry points must exist so callers fail by name`); continue; }
    const code = stripComments(fs.readFileSync(abs, "utf8"));
    for (const fn of fns) {
      const body = functionBody(code, fn);
      if (!body) failures.push(`R3 ${rel} — export ${fn}() missing (callers would get an import error, not a named refusal)`);
      else if (!/\brefuseQboNativeWrite\s*\(/.test(body)) failures.push(`R3 ${rel} — ${fn}() does not call refuseQboNativeWrite() (a silent no-op or a native write)`);
    }
  }

  // R4
  const schedAbs = path.join(root, SCHEDULER);
  if (!fs.existsSync(schedAbs)) failures.push(`R4 ${SCHEDULER} missing`);
  else {
    const sched = stripComments(fs.readFileSync(schedAbs, "utf8"));
    for (const fn of Object.values(REFUSAL_SITES).flat()) {
      if (new RegExp(`\\b${fn}\\b`).test(sched)) failures.push(`R4 ${SCHEDULER} — schedules refused entry point ${fn}() (every tick would record a refused step)`);
    }
  }

  // R5
  const ccAbs = path.join(root, CC_PAYMENT);
  if (!fs.existsSync(ccAbs)) failures.push(`R5 ${CC_PAYMENT} missing`);
  else {
    const cc = stripComments(fs.readFileSync(ccAbs, "utf8"));
    for (const { re, why } of CC_FORBIDDEN) {
      const m = re.exec(cc);
      if (m) failures.push(`R5 ${CC_PAYMENT}:${lineOf(cc, m.index)} — ${why}: \`${m[0]}\``);
    }
  }

  return { files, failures };
}

/** Registered-step entry: returns offender strings (empty = pass). */
export function run(root = REPO_ROOT) {
  return analyze(root).failures;
}

function copyInto(tmp, rel, root = REPO_ROOT) {
  const dst = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dst);
  return dst;
}

function selftest() {
  const results = [];
  const realFiles = [...new Set([...scopedFiles(REPO_ROOT), ...Object.keys(REFUSAL_SITES), SCHEDULER, CC_PAYMENT])];
  const fresh = () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-qbo-native-"));
    for (const rel of realFiles) copyInto(tmp, rel);
    return tmp;
  };
  const check = (name, mutate, expectFail, expectRe) => {
    const tmp = fresh();
    try {
      mutate(tmp);
      const { failures } = analyze(tmp);
      const hit = expectRe ? failures.some((f) => expectRe.test(f)) : failures.length > 0;
      const ok = expectFail ? hit : failures.length === 0;
      results.push({ name, ok, detail: ok ? "" : JSON.stringify(failures.slice(0, 3)) });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };
  const edit = (tmp, rel, fn) => {
    const p = path.join(tmp, rel);
    fs.writeFileSync(p, fn(fs.readFileSync(p, "utf8")));
  };
  const APB = "apps/backend/src/qbo-sync/ap-bills-puller.ts";

  check("real tree copy passes", () => {}, false);
  check("R1 plant: INSERT INTO accounting.bills in a real puller", (t) =>
    edit(t, APB, (s) => s + "\nexport async function plant(c: any) { await c.query(`INSERT INTO accounting.bills (id) VALUES ($1)`, [1]); }\n"), true, /R1 .*accounting\.bills/);
  check("R1 plant: UPDATE mdata.customers in a real master puller", (t) =>
    edit(t, "apps/backend/src/qbo-sync/customers-puller.ts", (s) => s + "\nconst PLANT = `UPDATE mdata.customers SET customer_name = $2 WHERE id = $1`;\n"), true, /R1 .*mdata\.customers/);
  check("R1 plant: new file in scope writes catalogs.items", (t) =>
    fs.writeFileSync(path.join(t, "apps/backend/src/qbo-sync/plant-new-puller.ts"), "export const X = `INSERT INTO catalogs.items (id) VALUES ($1)`;\n"), true, /R1 .*plant-new-puller.*catalogs\.items/);
  check("R1 near miss: comment-only mention does NOT fail", (t) =>
    edit(t, APB, (s) => s + "\n// formerly: INSERT INTO accounting.bills ... (history)\n/* UPDATE catalogs.accounts was removed */\n"), false);
  check("R1 allowed: mirror write mdata.qbo_ap_bills does NOT fail", (t) =>
    edit(t, APB, (s) => s + "\nconst OK = `UPDATE mdata.qbo_ap_bills SET active = false WHERE qbo_id = $1`;\n"), false);
  check("R2 plant: dynamic INSERT INTO ${...} in a QBO puller", (t) =>
    edit(t, APB, (s) => s + "\nconst DYN = (tbl: string) => `INSERT INTO ${tbl} (id) VALUES ($1)`;\n"), true, /R2 .*ap-bills-puller/);
  check("R2 plant: carrier bootstrap copy list gains accounting.bills", (t) =>
    edit(t, DYNAMIC_SITE, (s) => s.replace('table: "catalogs.complaint_types"', 'table: "accounting.bills"')), true, /R2 .*accounting\.bills/);
  check("R3 plant: reconciler refusal reverted to a silent no-op", (t) =>
    edit(t, "apps/backend/src/qbo-sync/customers-reconciler.ts", (s) =>
      s.replace(/return refuseQboNativeWrite\([^;]*\);/, "return { driftDetected: 0, createdFromQbo: 0, healed: 0, localOnly: 0, reconciledAt: '' };")), true, /R3 .*reconcileCustomers/);
  check("R4 plant: scheduler re-schedules a refused projection", (t) =>
    edit(t, SCHEDULER, (s) => s + "\nexport async function plant(id: string) { const { projectApBillsToLedger } = await import('./ap-bills-puller.js'); await projectApBillsToLedger(id); }\n"), true, /R4 .*projectApBillsToLedger/);
  check("R5 plant: cc-payment stamps a fabricated qbo_bill_payment_id", (t) =>
    edit(t, CC_PAYMENT, (s) => s + "\nconst PLANT = `UPDATE accounting.payments_x SET qbo_bill_payment_id = $3 WHERE id = $1`;\n"), true, /R5 .*qbo_bill_payment_id/);
  check("R5 plant: cc-payment queues a qbo.* outbox event", (t) =>
    edit(t, CC_PAYMENT, (s) => s + '\nconst EVT = "qbo.cc_bill_payment.created";\n'), true, /R5 .*qbo\.\*/);

  const pass = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  ${r.detail}` : ""}`);
  console.log(`${LABEL} --selftest ${pass}/${results.length}`);
  return pass === results.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    process.exit(selftest() ? 0 : 1);
  }
  const { files, failures } = analyze(REPO_ROOT);
  if (failures.length) {
    console.error(`${LABEL} FAIL — ${failures.length} violation(s) across ${files.length} scoped files:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — ${files.length} scoped QBO files write only mirror/staging tables; ${Object.values(REFUSAL_SITES).flat().length} former QBO->native entry points refuse by name; scheduler + cc-payment clean`);
}
