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
 * ACCT-F4431381 (Lead 443.137 item 9e, part 2) — the remaining writers part 1 found:
 *   R1/R3 now also cover integrations/qbo/qbo-vendor-linkage.service.ts: it no longer INSERTs mdata.drivers /
 *       mdata.units or UPDATEs their qbo_vendor_id / qbo_class_id; its six writers refuse by name.
 *   R6  Every scripts/ops/ file whose name contains "qbo" carries no native write (same allowed targets as
 *       R1), and the three retired QBO backfills (bill payments, purchases -> expenses, item expense
 *       accounts) refuse by name (QBO_NATIVE_WRITE_REFUSED + process.exit(1)) and open no connection.
 *   R7  The carrier bootstrap writes no qbo_* mirror table at all (it used to clone the template's QuickBooks
 *       chart into the new carrier's mdata.qbo_accounts with qbo_id NULL — rows QuickBooks never had), and
 *       names its chart refusal (coa_refused).
 *   R8  The dead QBO files removed in part 2 stay absent (qbo-cc-payment-poster.ts, master-data-anchor-drift.ts).
 *   R9  POST /api/v1/qbo/bulk-link refuses by name (409 + QBO_NATIVE_WRITE_REFUSED) and carries no
 *       UPDATE/INSERT into mdata.drivers / mdata.units / mdata.equipment. Driver/unit PATCH routes
 *       refuse a qbo_vendor_id body key the same way (class may still be a TMS catalog id).
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
  // ACCT-F4431381 (9e part 2)
  "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts",
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

/** R9 — bulk QBO id writes stay refused; native PATCH never accepts qbo_vendor_id. */
const BULK_LINK_ROUTES = "apps/backend/src/qbo/bulk-link.routes.ts";
const DRIVER_ROUTES = "apps/backend/src/mdata/drivers.routes.ts";
const UNIT_ROUTES = "apps/backend/src/mdata/units.routes.ts";
const R9_NATIVE_WRITE_RE =
  /\b(INSERT\s+INTO|UPDATE)\s+(?:ONLY\s+)?"?mdata"?\s*\.\s*"?(drivers|units|equipment)"?/gi;

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
  // ACCT-F4431381 (9e part 2) — no mdata.qbo_* link table exists, so every native writer refuses.
  "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts": [
    "createDriverWithQboVendor",
    "createUnitWithQboClass",
    "linkVendor",
    "unlinkVendor",
    "linkClass",
    "unlinkClass",
  ],
};
const VENDOR_LINKAGE_ROUTES = "apps/backend/src/integrations/qbo/qbo-vendor-linkage.routes.ts";

/** R6 — scripts/ops QBO files: no native write; the retired backfills refuse by name. */
const OPS_DIR = "scripts/ops";
const RETIRED_OPS_BACKFILLS = [
  "scripts/ops/backfill-qbo-bill-payments.mjs",
  "scripts/ops/backfill-qbo-purchases-expenses.mjs",
  "scripts/ops/backfill-qbo-item-expense-accounts.mjs",
];
/** R8 — dead QBO files removed in part 2; they must stay absent. */
const REMOVED_FILES = [
  "apps/backend/src/bill-payments/qbo-cc-payment-poster.ts",
  "apps/backend/src/qbo-sync/master-data-anchor-drift.ts",
];
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

export function opsQboFiles(root) {
  const abs = path.join(root, OPS_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /qbo/i.test(f) && /\.(mjs|js|ts|mts|cjs)$/.test(f))
    .map((f) => path.posix.join(OPS_DIR, f))
    .sort();
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

  // R6 — scripts/ops QBO files
  const opsFiles = opsQboFiles(root);
  for (const rel of opsFiles) {
    const code = stripComments(fs.readFileSync(path.join(root, rel), "utf8"));
    for (const m of code.matchAll(WRITE_RE)) {
      const [, verb, schema, table] = m;
      if (!isAllowedTarget(schema.toLowerCase(), table.toLowerCase())) {
        failures.push(`R6 ${rel}:${lineOf(code, m.index)} — ${verb.replace(/\s+/g, " ").toUpperCase()} ${schema.toLowerCase()}.${table.toLowerCase()}: a QBO ops script writes a native table`);
      }
    }
  }
  for (const rel of RETIRED_OPS_BACKFILLS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue; // deleted is fine — nothing can run it
    const code = stripComments(fs.readFileSync(abs, "utf8"));
    if (!/QBO_NATIVE_WRITE_REFUSED/.test(code) || !/process\.exit\(\s*1\s*\)/.test(code)) {
      failures.push(`R6 ${rel} — retired QBO backfill must refuse by name (QBO_NATIVE_WRITE_REFUSED) and exit 1`);
    }
    if (/\bfrom\s+["']pg["']|require\(\s*["']pg["']\s*\)|new\s+(?:pg\.)?(?:Client|Pool)\s*\(/.test(code)) {
      failures.push(`R6 ${rel} — retired QBO backfill must open no database connection`);
    }
  }

  // R7 — carrier bootstrap writes no qbo_* mirror and names its chart refusal
  const bootAbs = path.join(root, DYNAMIC_SITE);
  if (fs.existsSync(bootAbs)) {
    const boot = stripComments(fs.readFileSync(bootAbs, "utf8"));
    for (const m of boot.matchAll(WRITE_RE)) {
      const [, verb, schema, table] = m;
      if (/^qbo/.test(schema.toLowerCase()) || /^qbo_/.test(table.toLowerCase())) {
        failures.push(`R7 ${DYNAMIC_SITE}:${lineOf(boot, m.index)} — ${verb.replace(/\s+/g, " ").toUpperCase()} ${schema.toLowerCase()}.${table.toLowerCase()}: the carrier bootstrap writes the QuickBooks archive (rows QuickBooks never had)`);
      }
    }
    if (!/\bcoa_refused\b/.test(boot)) failures.push(`R7 ${DYNAMIC_SITE} — the chart step must name its refusal (coa_refused)`);
  }

  // R8 — removed dead QBO files stay absent
  for (const rel of REMOVED_FILES) {
    if (fs.existsSync(path.join(root, rel))) failures.push(`R8 ${rel} — removed in 443.137 9e (no callers; QuickBooks is a read-only archive); must stay absent`);
  }

  // R3 (routes) — the vendor-linkage routes answer the refusal as 409, never a 500
  const vlrAbs = path.join(root, VENDOR_LINKAGE_ROUTES);
  if (fs.existsSync(vlrAbs)) {
    const vlr = stripComments(fs.readFileSync(vlrAbs, "utf8"));
    const handled = (vlr.match(/isQboNativeWriteRefusedError\(error\)\)\s*return\s+sendNativeWriteRefused/g) ?? []).length;
    if (!/reply\.code\(409\)\.send\(\{\s*error:\s*QBO_NATIVE_WRITE_REFUSED/.test(vlr) || handled < 7) {
      failures.push(`R3 ${VENDOR_LINKAGE_ROUTES} — all 7 write routes must answer QBO_NATIVE_WRITE_REFUSED as 409 (found ${handled})`);
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

  // R9 — bulk-link + driver/unit PATCH refuse qbo_vendor_id writes onto native master rows
  const bulkAbs = path.join(root, BULK_LINK_ROUTES);
  if (!fs.existsSync(bulkAbs)) {
    failures.push(`R9 ${BULK_LINK_ROUTES} missing — bulk-link must stay registered and refuse by name`);
  } else {
    const bulk = stripComments(fs.readFileSync(bulkAbs, "utf8"));
    if (!/reply\.code\(409\)\.send\(\{\s*error:\s*QBO_NATIVE_WRITE_REFUSED/.test(bulk)) {
      failures.push(`R9 ${BULK_LINK_ROUTES} — POST /api/v1/qbo/bulk-link must answer 409 QBO_NATIVE_WRITE_REFUSED`);
    }
    R9_NATIVE_WRITE_RE.lastIndex = 0;
    const nativeWrite = R9_NATIVE_WRITE_RE.exec(bulk);
    if (nativeWrite) {
      failures.push(
        `R9 ${BULK_LINK_ROUTES}:${lineOf(bulk, nativeWrite.index)} — bulk-link must not write mdata.${nativeWrite[2]}`,
      );
    }
  }
  for (const [rel, label] of [
    [DRIVER_ROUTES, "drivers"],
    [UNIT_ROUTES, "units"],
  ]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`R9 ${rel} missing — ${label} PATCH must refuse qbo_vendor_id`);
      continue;
    }
    const code = stripComments(fs.readFileSync(abs, "utf8"));
    if (!/"qbo_vendor_id"\s+in\s+b/.test(code) || !/QBO_NATIVE_WRITE_REFUSED/.test(code)) {
      failures.push(`R9 ${rel} — PATCH must refuse body key qbo_vendor_id with QBO_NATIVE_WRITE_REFUSED`);
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
  const realFiles = [
    ...new Set([
      ...scopedFiles(REPO_ROOT),
      ...Object.keys(REFUSAL_SITES),
      SCHEDULER,
      CC_PAYMENT,
      VENDOR_LINKAGE_ROUTES,
      BULK_LINK_ROUTES,
      DRIVER_ROUTES,
      UNIT_ROUTES,
      ...opsQboFiles(REPO_ROOT),
    ]),
  ];
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

  // ACCT-F4431381 (9e part 2)
  const VL = "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts";
  const BP = "scripts/ops/backfill-qbo-bill-payments.mjs";
  check("R1 plant: vendor linkage re-adds INSERT INTO mdata.drivers", (t) =>
    edit(t, VL, (s) => s + "\nconst PLANT = `INSERT INTO mdata.drivers (first_name) VALUES ($1)`;\n"), true, /R1 .*qbo-vendor-linkage.*mdata\.drivers/);
  check("R1 near miss: vendor linkage comment naming UPDATE mdata.units does NOT fail", (t) =>
    edit(t, VL, (s) => s + "\n// formerly UPDATE mdata.units SET qbo_class_id = $2 (history)\n"), false);
  check("R3 plant: vendor linkage linkVendor refusal reverted", (t) =>
    edit(t, VL, (s) => s.replace('"integrations/qbo/qbo-vendor-linkage#linkVendor"', "X").replace(/(export async function linkVendor[\s\S]*?)return refuseQboNativeWrite\(/, "$1return noop(")), true, /R3 .*linkVendor/);
  check("R3 plant: a vendor-linkage route stops answering 409", (t) =>
    edit(t, VENDOR_LINKAGE_ROUTES, (s) => s.replace("if (isQboNativeWriteRefusedError(error)) return sendNativeWriteRefused(reply, error);", "")), true, /R3 .*409/);
  check("R6 plant: retired backfill re-adds INSERT INTO accounting.bill_payments", (t) =>
    edit(t, BP, (s) => s + "\nconst SQL = `INSERT INTO accounting.bill_payments (id) VALUES ($1)`;\n"), true, /R6 .*accounting\.bill_payments/);
  check("R6 plant: retired backfill loses its refusal", (t) =>
    edit(t, BP, (s) => s.split("QBO_NATIVE_WRITE_REFUSED").join("X")), true, /R6 .*refuse by name/);
  check("R6 plant: retired backfill opens a pg connection", (t) =>
    edit(t, BP, (s) => 'import pg from "pg";\n' + s), true, /R6 .*no database connection/);
  check("R6 plant: new scripts/ops QBO file writes catalogs.items", (t) =>
    fs.writeFileSync(path.join(t, "scripts/ops/backfill-qbo-plant.mjs"), "await c.query(`UPDATE catalogs.items SET default_expense_account_id = $2 WHERE id = $1`);\n"), true, /R6 .*backfill-qbo-plant.*catalogs\.items/);
  check("R6 near miss: comment-only native write in a retired backfill does NOT fail", (t) =>
    edit(t, BP, (s) => s + "\n// formerly: INSERT INTO accounting.bill_payments ... (history)\n"), false);
  check("R7 plant: carrier bootstrap re-adds the chart clone into mdata.qbo_accounts", (t) =>
    edit(t, DYNAMIC_SITE, (s) => s + "\nconst PLANT = `INSERT INTO mdata.qbo_accounts (id, operating_company_id) SELECT gen_random_uuid(), $2 FROM mdata.qbo_accounts`;\n"), true, /R7 .*mdata\.qbo_accounts/);
  check("R8 plant: the removed QBO CC payment poster comes back", (t) => {
    const f = path.join(t, REMOVED_FILES[0]);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, "export const PayType = 'CreditCard';\n");
  }, true, /R8 .*qbo-cc-payment-poster/);

  // ACCT-F4431381 (9e last gaps) — R9
  check("R9 plant: bulk-link stops answering 409", (t) =>
    edit(t, BULK_LINK_ROUTES, (s) => s.replace("reply.code(409).send({", "reply.code(200).send({")), true, /R9 .*409/);
  check("R9 plant: bulk-link re-adds UPDATE mdata.drivers", (t) =>
    edit(t, BULK_LINK_ROUTES, (s) => s + "\nconst PLANT = `UPDATE mdata.drivers SET qbo_vendor_id = $2 WHERE id = $1`;\n"), true, /R9 .*mdata\.drivers/);
  check("R9 plant: drivers PATCH loses qbo_vendor_id refusal", (t) =>
    edit(t, DRIVER_ROUTES, (s) => s.replace(/if\s*\(\s*"qbo_vendor_id"\s+in\s+b\s*\)/, 'if ("__gone__" in b)')), true, /R9 .*drivers.*qbo_vendor_id/);
  check("R9 plant: units PATCH loses QBO_NATIVE_WRITE_REFUSED", (t) =>
    edit(t, UNIT_ROUTES, (s) => s.split("QBO_NATIVE_WRITE_REFUSED").join("X")), true, /R9 .*units.*qbo_vendor_id/);

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
  console.log(`${LABEL} PASS — ${files.length} scoped QBO files + ${opsQboFiles(REPO_ROOT).length} scripts/ops QBO files write only mirror/staging tables; ${Object.values(REFUSAL_SITES).flat().length} former QBO->native entry points refuse by name; scheduler + cc-payment clean`);
}
