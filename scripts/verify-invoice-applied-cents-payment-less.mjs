#!/usr/bin/env node
/**
 * verify-invoice-applied-cents-payment-less — ACCT-F11103.
 *
 * ACCT-F11070 (#28623) records poster relief as an accounting.payment_applications row with payment_id NULL. Every reader
 * that SUMmed applications for an invoice through an INNER JOIN to accounting.payments dropped it: a $50,000.00 invoice with
 * a $20,000.00 relief application aged at $50,000.00 instead of $30,000.00.
 *
 * RULES (static, over the live tree):
 *   R1 the last-declaring migration of accounting.invoice_applied_cents_as_of LEFT JOINs payments, dates by
 *      COALESCE(p.payment_date, applied_at) and carries the unapplied + voided-payment predicates.
 *   R2 the last-declaring migrations of accounting.ar_aging_as_of and accounting.recompute_invoice_paid read
 *      accounting.invoice_applied_cents_as_of (the trigger with 'infinity') — one rule, so header and dated aging agree.
 *   R3 no backend source (non-test) SUMs payment_applications through an INNER JOIN payment_applications -> payments.
 *   R4 each named A/R reader goes through the shared rule (invoice-applied-cents.ts helpers or the SQL function).
 *
 * --selftest plants each defect in memory and requires a FAIL for each, and PASS on the real tree.
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "[verify-invoice-applied-cents-payment-less]";
const ROOT = process.cwd();
const MIG_DIR = "db/migrations";
const SRC_DIR = "apps/backend/src";

const READERS = {
  "apps/backend/src/accounting/ar-aging.service.ts": [/\$\{invoiceAppliedCentsAsOfSql\("i", "\$2::date"\)\}/],
  "apps/backend/src/accounting/fin20-aging.service.ts": [/\$\{invoiceAppliedCentsAsOfSql\("i", "\$3::date"\)\}/],
  "apps/backend/src/accounting/consolidated-statements.service.ts": [/\$\{invoiceAppliedCentsAsOfSql\("i", "\$2::date"\)\}/],
  "apps/backend/src/accounting/counterparty-statements.service.ts": [
    /\$\{invoiceAppliedCentsAsOfSql\("i", "\(\$3::date - 1\)"\)\}/,
    /LEFT JOIN accounting\.payments p ON p\.id = pa\.payment_id/,
    /\$\{applicationDateSql\("pa", "p"\)\} BETWEEN \$3::date AND \$4::date/,
  ],
  "apps/backend/src/accounting/customer-activity.service.ts": [
    /LEFT JOIN accounting\.payments p ON p\.id = pa\.payment_id/,
    /\$\{applicationLiveSql\("pa", "p"\)\}/,
  ],
  "apps/backend/src/accounting/db-scope.ts": [/accounting\.invoice_applied_cents_as_of\(i\.id, 'infinity'::date\)/],
  "apps/backend/src/accounting/cash-basis/profit-loss-cash.service.ts": [
    /LEFT JOIN accounting\.payments pm/,
    /\$\{applicationDateSql\("pa", "pm"\)\}::text AS settled_on/,
    /\$\{applicationLiveSql\("pa", "pm"\)\}/,
  ],
  "apps/backend/src/accounting/invoices.routes.ts": [/LEFT JOIN accounting\.payments p ON p\.id = pa\.payment_id/],
  "apps/backend/src/dispatch/loads-bulk.routes.ts": [/LEFT JOIN accounting\.payments p\s+ON p\.id = pa\.payment_id/],
};

const HELPER = "apps/backend/src/accounting/invoice-applied-cents.ts";
const HELPER_RULES = [
  /accounting\.invoice_applied_cents_as_of\(\$\{alias\}\.id, \$\{asOfSql\}\)/,
  /COALESCE\(\$\{p\}\.payment_date, \(\$\{pa\}\.applied_at AT TIME ZONE 'UTC'\)::date\)/,
  // ACCT-F11103 part 2 (202616410100): the live rule is the dated relieve rule as of 'infinity'.
  /return applicationRelievesAsOfSql\(pa, p, `'infinity'::date`\);/,
];

function stripSqlComments(text) {
  return text.replace(/^\s*--.*$/gm, "");
}

/** Body of the LAST migration (sorted by name) that CREATE OR REPLACEs `signature`, cut at the next CREATE / GRANT. */
function lastDefinition(migrations, signature) {
  let last = null;
  for (const name of Object.keys(migrations).sort()) {
    const text = migrations[name];
    const at = text.indexOf(signature);
    if (at < 0) continue;
    const rest = text.slice(at + signature.length);
    const end = rest.search(/\n(CREATE OR REPLACE|GRANT|COMMENT ON)\b/);
    last = { name, body: stripSqlComments(end < 0 ? rest : rest.slice(0, end)) };
  }
  return last;
}

/** R3: INNER JOIN application -> payment inside a SUM over payment_applications. */
function innerJoinSums(text) {
  const hits = [];
  const re = /(^|[^A-Za-z])JOIN\s+accounting\.payments\s+(\w+)\s+ON\s+\2\.id\s*=\s*(\w+)\.payment_id/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index + m[1].length);
    if (/LEFT\s*$/.test(before)) continue;
    const windowBefore = text.slice(Math.max(0, m.index - 260), m.index);
    // the join reaches payments FROM the application alias, inside a SUM over payment_applications
    if (/SUM\(/.test(windowBefore) && new RegExp(`accounting\\.payment_applications\\s+${m[3]}\\b`).test(windowBefore)) {
      hits.push(text.slice(0, m.index).split("\n").length);
    }
  }
  return hits;
}

export function check({ migrations, sources }) {
  const failures = [];

  const fn = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(");
  if (!fn) {
    failures.push("R1: no migration declares accounting.invoice_applied_cents_as_of(uuid, date)");
  } else {
    const b = fn.body;
    if (!/LEFT JOIN accounting\.payments p/.test(b)) failures.push(`R1: ${fn.name}: invoice_applied_cents_as_of must LEFT JOIN accounting.payments (an INNER JOIN drops payment-less applications)`);
    if (/(^|[^T]\s)JOIN accounting\.payments p/.test(b.replace(/LEFT JOIN accounting\.payments p/g, ""))) failures.push(`R1: ${fn.name}: invoice_applied_cents_as_of INNER JOINs accounting.payments`);
    if (!/COALESCE\(p\.payment_date, \(pa\.applied_at AT TIME ZONE 'UTC'\)::date\) <= p_as_of/.test(b)) failures.push(`R1: ${fn.name}: a payment-less application must be dated by its own applied_at`);
    if (!/pa\.unapplied_at IS NULL OR \(pa\.unapplied_at AT TIME ZONE 'UTC'\)::date > p_as_of/.test(b)) failures.push(`R1: ${fn.name}: missing the as-of unapplied rule`);
    if (!/p\.voided_at IS NULL OR \(p\.voided_at AT TIME ZONE 'UTC'\)::date > p_as_of/.test(b)) failures.push(`R1: ${fn.name}: missing the as-of voided-payment rule`);
    if (/AND pa\.payment_id IS NOT NULL/.test(b)) failures.push(`R1: ${fn.name}: must not exclude payment-less applications (payment_id IS NOT NULL)`);
  }

  const aging = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(");
  if (!aging) failures.push("R2: no migration declares accounting.ar_aging_as_of");
  else {
    if (!/accounting\.invoice_applied_cents_as_of\(i\.id, p_as_of\)/.test(aging.body)) failures.push(`R2: ${aging.name}: ar_aging_as_of must read accounting.invoice_applied_cents_as_of(i.id, p_as_of)`);
    if (/JOIN accounting\.payments/.test(aging.body.replace(/LEFT JOIN accounting\.payments/g, ""))) failures.push(`R2: ${aging.name}: ar_aging_as_of INNER JOINs accounting.payments`);
  }
  const trig = lastDefinition(migrations, "CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()");
  if (!trig) failures.push("R2: no migration declares accounting.recompute_invoice_paid()");
  else if (!/v_paid := accounting\.invoice_applied_cents_as_of\(v_invoice_id, 'infinity'::date\)/.test(trig.body)) {
    failures.push(`R2: ${trig.name}: recompute_invoice_paid must derive v_paid from accounting.invoice_applied_cents_as_of(v_invoice_id, 'infinity')`);
  }

  for (const [file, text] of Object.entries(sources)) {
    for (const line of innerJoinSums(text)) {
      failures.push(`R3: ${file}:${line}: SUM over payment_applications INNER JOINs accounting.payments — payment-less relief applications (payment_id NULL) are dropped; use invoiceAppliedCentsAsOfSql / LEFT JOIN (ACCT-F11103)`);
    }
  }

  for (const [file, rules] of Object.entries(READERS)) {
    const text = sources[file];
    if (text == null) { failures.push(`R4: ${file} not found`); continue; }
    for (const r of rules) if (!r.test(text)) failures.push(`R4: ${file}: missing ${r}`);
  }
  const helper = sources[HELPER];
  if (helper == null) failures.push(`R4: ${HELPER} not found`);
  else for (const r of HELPER_RULES) if (!r.test(helper)) failures.push(`R4: ${HELPER}: missing ${r}`);

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
  const OLD_SUM = `COALESCE((
    SELECT SUM(COALESCE(pa.amount_cents, 0))
    FROM accounting.payment_applications pa
    JOIN accounting.payments p
      ON p.id = pa.payment_id
     AND p.operating_company_id = i.operating_company_id
    WHERE pa.invoice_id = i.id
  ), 0)`;
  const lastMig = Object.keys(real.migrations).sort().filter((n) => real.migrations[n].includes("FUNCTION accounting.invoice_applied_cents_as_of(")).pop();
  const mutate = (fn) => { const t = { migrations: { ...real.migrations }, sources: { ...real.sources } }; fn(t); return t; };
  const cases = [
    ["ar-aging back on the INNER JOIN sum", mutate((t) => {
      const f = "apps/backend/src/accounting/ar-aging.service.ts";
      t.sources[f] = t.sources[f].replaceAll('${invoiceAppliedCentsAsOfSql("i", "$2::date")}', OLD_SUM);
    })],
    ["a new reader with an INNER JOIN sum", mutate((t) => { t.sources["apps/backend/src/accounting/planted.ts"] = `const q = \`SELECT ${OLD_SUM}\`;`; })],
    ["function INNER JOINs payments", mutate((t) => { t.migrations[lastMig] = t.migrations[lastMig].replace("LEFT JOIN accounting.payments p", "JOIN accounting.payments p"); })],
    ["function drops payment-less rows", mutate((t) => { t.migrations[lastMig] = t.migrations[lastMig].replace("WHERE i.id = p_invoice_id", "WHERE i.id = p_invoice_id AND pa.payment_id IS NOT NULL"); })],
    ["function dates relief by payment only", mutate((t) => { t.migrations[lastMig] = t.migrations[lastMig].replace("COALESCE(p.payment_date, (pa.applied_at AT TIME ZONE 'UTC')::date) <= p_as_of", "p.payment_date <= p_as_of"); })],
    ["ar_aging_as_of off the function", mutate((t) => { t.migrations["299999999999_planted.sql"] = `CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(p_opco uuid, p_as_of date) AS $$ SELECT ${OLD_SUM.replaceAll("i.", "i.")} $$;\n`; })],
    ["trigger off the function", mutate((t) => { t.migrations["299999999999_planted.sql"] = "CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()\n SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid FROM accounting.payment_applications;\n"; })],
    ["customer activity back on INNER JOIN", mutate((t) => {
      const f = "apps/backend/src/accounting/customer-activity.service.ts";
      t.sources[f] = t.sources[f].replace("LEFT JOIN accounting.payments p ON p.id = pa.payment_id", "JOIN accounting.payments p ON p.id = pa.payment_id");
    })],
    ["cash-basis settlements drop relief", mutate((t) => {
      const f = "apps/backend/src/accounting/cash-basis/profit-loss-cash.service.ts";
      t.sources[f] = t.sources[f].replace("LEFT JOIN accounting.payments pm", "JOIN accounting.payments pm");
    })],
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
  console.log(`${LABEL} PASS — invoice_applied_cents_as_of counts payment-less applications; ar_aging_as_of + recompute_invoice_paid + ${Object.keys(READERS).length} readers use it; 0 INNER JOIN sums`);
}
