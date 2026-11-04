#!/usr/bin/env node
/**
 * verify-ar-applications-need-live-source — ACCT-F11103 part 2.
 *
 * QuickBooks rule: an invoice's open balance = total − applications of NON-VOIDED payments − applications of NON-VOIDED
 * credit memos. Before 202616410100 a payment-less application (payment_id NULL) relieved the invoice with no link to the
 * money behind it, and a payment voided outside payment-void-stamp.service left its applications live in amount_paid_cents.
 *
 * RULES (static, over the live tree):
 *   S1 the last accounting.invoice_applied_cents_as_of: a payment-backed row needs its payment present and not voided as of
 *      the date; a payment-less row needs source_journal_entry_id AND accounting.journal_entry_live_as_of(...) as of the date.
 *   S2 a migration adds CHECK (payment_id IS NOT NULL OR source_journal_entry_id IS NOT NULL) on accounting.payment_applications.
 *   S3 the last accounting.journal_entry_live_as_of reads status 'posted', the void date and the reversal date.
 *   S4 triggers: payments.voided_at set → applications archived; a JE dying (void / reversal / unposted) → its payment-less
 *      applications archived (both via unapplied_at so accounting.recompute_invoice_paid follows).
 *   S5 the last accounting.ar_aging_as_of nets credit memos only while the application AND the credit memo are not voided as
 *      of the date.
 *   S6 every backend INSERT INTO accounting.payment_applications that writes payment_id NULL also writes source_journal_entry_id;
 *      applyInvoiceRelief refuses a missing / not-live source; both relief callers pass sourceJournalEntryId.
 *   S7 the row-level helper (invoice-applied-cents.ts) applies the same source-JE rule.
 *
 * --selftest plants each defect in memory and requires a FAIL for each, and PASS on the real tree.
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "[verify-ar-applications-need-live-source]";
const ROOT = process.cwd();
const MIG_DIR = "db/migrations";
const SRC_DIR = "apps/backend/src";
const RELIEF = "apps/backend/src/accounting/invoice-relief-application.service.ts";
const HELPER = "apps/backend/src/accounting/invoice-applied-cents.ts";
const RELIEF_CALLERS = {
  "apps/backend/src/accounting/factoring-posting/poster.service.ts": /raiseInvoicePaidTo\([\s\S]{0,300}?sourceJournalEntryId,?\s*\}\)/,
  "apps/backend/src/factoring/faro-reserve-entries.service.ts": /applyInvoiceRelief\([\s\S]{0,300}?sourceJournalEntryId: je\.id/,
};

const strip = (t) => t.replace(/^\s*--.*$/gm, "");

/** Body of the LAST migration (by name) that declares `signature`, cut at the next top-level statement. */
function lastDefinition(migrations, signature) {
  let last = null;
  for (const name of Object.keys(migrations).sort()) {
    const text = migrations[name];
    const at = text.lastIndexOf(signature);
    if (at < 0) continue;
    const rest = text.slice(at + signature.length);
    const end = rest.search(/\n(CREATE OR REPLACE|GRANT|COMMENT ON|DROP TRIGGER|CREATE TRIGGER)\b/);
    last = { name, body: strip(end < 0 ? rest : rest.slice(0, end)) };
  }
  return last;
}

function allMigrationText(migrations) {
  return Object.keys(migrations).sort().map((n) => strip(migrations[n])).join("\n");
}

/** S6: INSERT INTO accounting.payment_applications (cols) VALUES (vals) writing payment_id NULL without a source JE. */
function payload(text) {
  const out = [];
  const re = /INSERT INTO accounting\.payment_applications\s*\(([^)]*)\)\s*VALUES\s*\(([^;`]*?)\)\s*(RETURNING|ON CONFLICT|`)/g;
  let m;
  while ((m = re.exec(text))) {
    const cols = m[1].split(",").map((c) => c.trim());
    const vals = m[2].split(/,(?![^(]*\))/).map((v) => v.trim());
    const pi = cols.indexOf("payment_id");
    if (pi >= 0 && /^NULL$/i.test(vals[pi] ?? "") && !cols.includes("source_journal_entry_id")) {
      out.push(text.slice(0, m.index).split("\n").length);
    }
  }
  return out;
}

export function check({ migrations, sources }) {
  const failures = [];
  const all = allMigrationText(migrations);

  const fn = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(");
  if (!fn) failures.push("S1: no migration declares accounting.invoice_applied_cents_as_of");
  else {
    const b = fn.body;
    if (!/WHEN pa\.payment_id IS NOT NULL\s+THEN p\.id IS NOT NULL AND \(p\.voided_at IS NULL OR \(p\.voided_at AT TIME ZONE 'UTC'\)::date > p_as_of\)/.test(b)) {
      failures.push(`S1: ${fn.name}: a payment-backed application must need its payment present and not voided as of the date`);
    }
    if (!/ELSE pa\.source_journal_entry_id IS NOT NULL\s+AND accounting\.journal_entry_live_as_of\(pa\.source_journal_entry_id, p_as_of\)/.test(b)) {
      failures.push(`S1: ${fn.name}: a payment-less application must need a source JE live as of the date (no source, no relief)`);
    }
  }

  if (!/ADD CONSTRAINT payment_applications_payment_or_source_je_check\s+CHECK \(payment_id IS NOT NULL OR source_journal_entry_id IS NOT NULL\)/.test(all)) {
    failures.push("S2: no migration adds CHECK (payment_id IS NOT NULL OR source_journal_entry_id IS NOT NULL) on accounting.payment_applications");
  }

  const live = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.journal_entry_live_as_of(");
  if (!live) failures.push("S3: no migration declares accounting.journal_entry_live_as_of");
  else {
    for (const [re, what] of [
      [/je\.status = 'posted'/, "status 'posted'"],
      [/je\.voided_at IS NULL OR \(je\.voided_at AT TIME ZONE 'UTC'\)::date > p_as_of/, "the void date"],
      [/je\.reversed_by_je_id IS NULL OR rv\.entry_date > p_as_of/, "the reversal date"],
    ]) if (!re.test(live.body)) failures.push(`S3: ${live.name}: journal_entry_live_as_of must read ${what}`);
  }

  if (!/CREATE TRIGGER trg_payment_void_unapplies_applications\s+AFTER UPDATE OF voided_at ON accounting\.payments/.test(all)) {
    failures.push("S4: no trigger archives a voided payment's applications (trg_payment_void_unapplies_applications)");
  }
  const pv = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.tg_payment_void_unapplies_applications()");
  if (!pv || !/UPDATE accounting\.payment_applications[\s\S]*SET unapplied_at = NEW\.voided_at[\s\S]*WHERE payment_id = NEW\.id/.test(pv.body)) {
    failures.push("S4: tg_payment_void_unapplies_applications must stamp unapplied_at on the payment's applications");
  }
  if (!/CREATE TRIGGER trg_journal_entry_death_unapplies_relief\s+AFTER UPDATE OF status, reversed_by_je_id, voided_at ON accounting\.journal_entries/.test(all)) {
    failures.push("S4: no trigger archives a dead JE's payment-less relief (trg_journal_entry_death_unapplies_relief)");
  }
  const jd = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.tg_journal_entry_death_unapplies_relief()");
  if (!jd || !/WHERE source_journal_entry_id = NEW\.id[\s\S]*AND payment_id IS NULL/.test(jd.body)) {
    failures.push("S4: tg_journal_entry_death_unapplies_relief must stamp unapplied_at on the JE's payment-less applications");
  }

  const aging = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(");
  if (!aging) failures.push("S5: no migration declares accounting.ar_aging_as_of");
  else {
    if (!/JOIN accounting\.credit_memos cm/.test(aging.body) || !/cm\.voided_at IS NULL OR \(cm\.voided_at AT TIME ZONE 'UTC'\)::date > p_as_of/.test(aging.body)) {
      failures.push(`S5: ${aging.name}: ar_aging_as_of must net a credit memo only while the credit memo is not voided as of the date`);
    }
    if (!/cma\.voided_at IS NULL OR \(cma\.voided_at AT TIME ZONE 'UTC'\)::date > p_as_of/.test(aging.body)) {
      failures.push(`S5: ${aging.name}: ar_aging_as_of must read the credit memo application's void as of the date`);
    }
  }

  for (const [file, text] of Object.entries(sources)) {
    for (const line of payload(text)) failures.push(`S6: ${file}:${line}: payment-less application INSERT without source_journal_entry_id — no actual payment, no relief`);
  }
  const relief = sources[RELIEF];
  if (relief == null) failures.push(`S6: ${RELIEF} not found`);
  else {
    if (!/if \(!input\.sourceJournalEntryId\) throw new InvoiceReliefError\("invoice_relief_source_journal_entry_required"\)/.test(relief)) failures.push(`S6: ${RELIEF}: applyInvoiceRelief must refuse a missing source JE`);
    if (!/accounting\.journal_entry_live_as_of\(je\.id, 'infinity'::date\)/.test(relief) || !/r\.role = 'ar_control'/.test(relief)) failures.push(`S6: ${RELIEF}: applyInvoiceRelief must require a live JE crediting ar_control`);
  }
  for (const [file, re] of Object.entries(RELIEF_CALLERS)) {
    const text = sources[file];
    if (text == null) failures.push(`S6: ${file} not found`);
    else if (!re.test(text)) failures.push(`S6: ${file}: relief call must pass the JE it posted as sourceJournalEntryId`);
  }

  const helper = sources[HELPER];
  if (helper == null) failures.push(`S7: ${HELPER} not found`);
  else if (!/ELSE \$\{pa\}\.source_journal_entry_id IS NOT NULL\s+AND accounting\.journal_entry_live_as_of\(\$\{pa\}\.source_journal_entry_id, \$\{asOfSql\}\)/.test(helper)) {
    failures.push(`S7: ${HELPER}: applicationRelievesAsOfSql must require a live source JE for a payment-less row`);
  }
  return failures;
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== "node_modules" && ent.name !== "__tests__") walk(p, out); }
    else if (/\.ts$/.test(ent.name) && !/\.(test|spec)\.ts$/.test(ent.name)) out.push(p);
  }
  return out;
}

function loadTree() {
  const migrations = {};
  for (const n of fs.readdirSync(path.join(ROOT, MIG_DIR))) if (n.endsWith(".sql")) migrations[n] = fs.readFileSync(path.join(ROOT, MIG_DIR, n), "utf8");
  const sources = {};
  for (const f of walk(path.join(ROOT, SRC_DIR), [])) sources[path.relative(ROOT, f).split(path.sep).join("/")] = fs.readFileSync(f, "utf8");
  return { migrations, sources };
}

function selftest() {
  const real = loadTree();
  const realFailures = check(real);
  if (realFailures.length) {
    for (const f of realFailures) console.error(`${LABEL} --selftest FAIL (real tree) — ${f}`);
    process.exit(1);
  }
  const lastOf = (sig) => Object.keys(real.migrations).sort().filter((n) => real.migrations[n].includes(sig)).pop();
  const fnMig = lastOf("FUNCTION accounting.invoice_applied_cents_as_of(");
  const mutate = (fn) => { const t = { migrations: { ...real.migrations }, sources: { ...real.sources } }; fn(t); return t; };
  const editMig = (name, from, to) => (t) => { if (!t.migrations[name].includes(from)) throw new Error(`selftest anchor missing: ${from}`); t.migrations[name] = t.migrations[name].replace(from, to); };
  const editSrc = (file, from, to) => (t) => { if (!t.sources[file].includes(from)) throw new Error(`selftest anchor missing in ${file}: ${from}`); t.sources[file] = t.sources[file].replace(from, to); };
  const cases = [
    ["payment-less relief counted with no source (the 202616400100 rule)", mutate((t) => {
      t.migrations["299999999999_planted.sql"] = `CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(p_invoice_id uuid, p_as_of date)
  SELECT COALESCE(SUM(pa.amount_cents), 0) FROM accounting.payment_applications pa LEFT JOIN accounting.payments p ON p.id = pa.payment_id
   WHERE (p.voided_at IS NULL OR (p.voided_at AT TIME ZONE 'UTC')::date > p_as_of);
`;
    })],
    ["source JE checked for presence only", mutate(editMig(fnMig, "AND accounting.journal_entry_live_as_of(pa.source_journal_entry_id, p_as_of)", ""))],
    ["payment-backed row with a missing payment counts", mutate(editMig(fnMig, "THEN p.id IS NOT NULL AND (p.voided_at", "THEN (p.voided_at"))],
    ["CHECK dropped", mutate(editMig(fnMig, "CHECK (payment_id IS NOT NULL OR source_journal_entry_id IS NOT NULL) NOT VALID", "CHECK (true) NOT VALID"))],
    ["JE liveness ignores reversal", mutate(editMig(fnMig, "AND (je.reversed_by_je_id IS NULL OR rv.entry_date > p_as_of)", ""))],
    ["payment void trigger missing", mutate(editMig(fnMig, "CREATE TRIGGER trg_payment_void_unapplies_applications", "-- planted\nSELECT 1; -- trg_payment_void_unapplies_applications"))],
    ["JE death trigger missing", mutate(editMig(fnMig, "CREATE TRIGGER trg_journal_entry_death_unapplies_relief", "-- planted\nSELECT 1; -- trg_journal_entry_death_unapplies_relief"))],
    ["aging nets a voided credit memo", mutate(editMig(fnMig, "AND (cm.voided_at IS NULL OR (cm.voided_at AT TIME ZONE 'UTC')::date > p_as_of)", ""))],
    ["a writer inserts payment-less relief with no source", mutate((t) => {
      t.sources["apps/backend/src/accounting/planted.ts"] = "const q = `INSERT INTO accounting.payment_applications (operating_company_id, payment_id, invoice_id, amount_cents) VALUES ($1::uuid, NULL, $2::uuid, $3) RETURNING id`;";
    })],
    ["applyInvoiceRelief accepts a missing source", mutate(editSrc(RELIEF, 'if (!input.sourceJournalEntryId) throw new InvoiceReliefError("invoice_relief_source_journal_entry_required");', ""))],
    ["Faro short-pay relief written without its JE", mutate(editSrc("apps/backend/src/factoring/faro-reserve-entries.service.ts", "sourceJournalEntryId: je.id", "sourceJournalEntryId: null"))],
    ["row helper ignores the source JE", mutate(editSrc(HELPER, "AND accounting.journal_entry_live_as_of(${pa}.source_journal_entry_id, ${asOfSql})", ""))],
  ];
  let red = 0;
  for (const [name, tree] of cases) {
    const f = check(tree);
    if (f.length === 0) { console.error(`${LABEL} --selftest FAIL — planted defect stayed green: ${name}`); process.exit(1); }
    red++;
    console.log(`${LABEL} --selftest red as expected: ${name} (${f[0]})`);
  }
  console.log(`${LABEL} --selftest PASS — real tree green; ${red}/${cases.length} planted defects red`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const failures = check(loadTree());
  if (failures.length) { for (const f of failures) console.error(`${LABEL} FAIL — ${f}`); process.exit(1); }
  console.log(`${LABEL} PASS — only non-voided payments and payment-less relief with a live A/R-crediting JE relieve an invoice; voided payments and dead JEs archive their applications; credit memos net only while not voided`);
}
