#!/usr/bin/env node
/**
 * ACCT-F11099 (owner 2026-11-04) — a customer payment moves a factored invoice to partial / paid like QuickBooks; the factoring
 * identity lives in the factoring fields, never in the payment status.
 *
 * Checked statically (no database):
 *   1. The LAST migration that defines accounting.recompute_invoice_paid() has no `WHEN i.status = 'factored' THEN 'factored'`
 *      pin and still derives 'paid' and 'partial' from the applications.
 *   2. accounting.invoice_recoursed_off_trade_ar() is defined from the factoring link (a 'factoring_chargeback' posting) and is
 *      NOT "factoring_status <> 'not_factored'" (a funded invoice stays on trade A/R — secured borrowing).
 *   3. The LAST definitions of accounting.ar_aging_as_of() and views.ar_aging call that identity.
 *   4. Every backend source file that excludes / zeroes / blocks an invoice by status 'factored' (an A/R reader) calls the
 *      identity helper (invoiceOnTradeArSql / invoiceRecoursedOffTradeArSql) at least once per such site — so a recoursed
 *      invoice a payment moved to partial / paid is still recognised as factored.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-factored-invoice-payment-status";
const MIG_DIR = "db/migrations";
const SRC_DIR = "apps/backend/src";

const OLD_PIN = /WHEN\s+i\.status\s*=\s*'factored'\s+THEN\s+'factored'/i;
const IDENTITY = "invoice_recoursed_off_trade_ar";

/** Status-'factored' exclusion sites in a TS source (A/R readers). */
const SITE_PATTERNS = [
  /status\s+NOT\s+IN\s*\([^)]*'factored'[^)]*\)/gi,
  /status\s+NOT\s+IN\s+\$\{AR_STATUS_EXCLUSIONS\}/g,
  /status\s*<>\s*'factored'/gi,
  /status\s*=\s*'factored'\s+(?:OR\s+[^\n]*?)?THEN\s+0/gi,
  /\.status\s*===\s*"factored"/g,
];
const HELPER = /\b(?:invoiceOnTradeArSql|invoiceRecoursedOffTradeArSql)\(/g;
const HELPER_MODULE = "apps/backend/src/accounting/invoice-factored-identity.ts";

function lastDefinition(migrations, re) {
  let hit = null;
  for (const m of migrations) {
    const idx = m.text.search(re);
    if (idx >= 0) hit = { name: m.name, text: m.text, idx };
  }
  return hit;
}

/** Body of the statement that starts at `idx` (up to the next CREATE / COMMIT at line start). */
function statementFrom(text, idx) {
  const rest = text.slice(idx + 1);
  const end = rest.search(/\n(?:CREATE\s|COMMIT;|GRANT\s|DROP\s|ALTER\s)/i);
  return text.slice(idx, end < 0 ? text.length : idx + 1 + end);
}

export function analyze({ migrations, sources }) {
  const failures = [];

  const recompute = lastDefinition(migrations, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.recompute_invoice_paid\s*\(/i);
  if (!recompute) failures.push("no migration defines accounting.recompute_invoice_paid()");
  else {
    const body = statementFrom(recompute.text, recompute.idx);
    if (OLD_PIN.test(body)) {
      failures.push(`${recompute.name}: accounting.recompute_invoice_paid() still pins a factored invoice ('factored' THEN 'factored') — a payment must move it to partial / paid (owner 2026-11-04).`);
    }
    if (!/THEN\s+'paid'/i.test(body) || !/THEN\s+'partial'/i.test(body)) {
      failures.push(`${recompute.name}: accounting.recompute_invoice_paid() no longer derives 'paid' / 'partial'.`);
    }
  }

  const ident = lastDefinition(migrations, new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+accounting\\.${IDENTITY}\\s*\\(`, "i"));
  if (!ident) failures.push(`no migration defines accounting.${IDENTITY}()`);
  else {
    const body = statementFrom(ident.text, ident.idx);
    if (!/'factoring_chargeback'/.test(body)) {
      failures.push(`${ident.name}: accounting.${IDENTITY}() must read the factoring link (a 'factoring_chargeback' posting on the advance).`);
    }
    if (/factoring_status[^\n]*<>\s*'not_factored'/i.test(body) || /factoring_status[^\n]*NOT\s+IN\s*\(\s*'not_factored'/i.test(body)) {
      failures.push(`${ident.name}: accounting.${IDENTITY}() treats every funded invoice as off trade A/R — a funded ('advanced') invoice stays on A/R as pledged collateral.`);
    }
  }

  for (const [what, re] of [
    ["accounting.ar_aging_as_of()", /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+accounting\.ar_aging_as_of\s*\(/i],
    ["views.ar_aging", /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+views\.ar_aging\b/i],
  ]) {
    const def = lastDefinition(migrations, re);
    if (!def) failures.push(`no migration defines ${what}`);
    else if (!statementFrom(def.text, def.idx).includes(IDENTITY)) {
      failures.push(`${def.name}: ${what} excludes factored invoices by status only — a recoursed invoice a payment moved to partial re-enters trade A/R; call accounting.${IDENTITY}(i.id).`);
    }
  }

  for (const { path, text } of sources) {
    if (path === HELPER_MODULE) continue;
    let sites = 0;
    for (const re of SITE_PATTERNS) sites += (text.match(re) ?? []).length;
    if (sites === 0) continue;
    const helpers = (text.match(HELPER) ?? []).length;
    if (helpers < sites) {
      failures.push(`${path}: ${sites} status-'factored' A/R site(s) but ${helpers} factoring-identity call(s) — repoint each to invoiceOnTradeArSql / invoiceRecoursedOffTradeArSql (ACCT-F11099).`);
    }
  }
  return failures;
}

function readMigrations() {
  return readdirSync(join(ROOT, MIG_DIR))
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(ROOT, MIG_DIR, name), "utf8") }));
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n === "__tests__") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
  }
  return out;
}

function readSources() {
  return walk(join(ROOT, SRC_DIR)).map((p) => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") }));
}

function selftest() {
  const migrations = readMigrations();
  const sources = readSources();
  const real = analyze({ migrations, sources });
  if (real.length) throw new Error(`[${LABEL}] selftest: the real tree should PASS but failed:\n  ${real.join("\n  ")}`);

  const expectFail = (label, input, needle) => {
    const f = analyze(input);
    if (!f.some((x) => x.includes(needle))) throw new Error(`[${LABEL}] selftest: planted defect "${label}" not caught (got: ${f.join("; ") || "clean"})`);
  };

  // 1. the pre-ACCT-F11099 recompute (pin restored) appended as the last definition.
  const pinned = migrations.find((m) => m.name.startsWith("202612821200_"));
  if (!pinned) throw new Error(`[${LABEL}] selftest: 202612821200 fixture missing`);
  expectFail("old recompute pin", { migrations: [...migrations, { name: "999999999999_planted.sql", text: pinned.text }], sources }, "still pins a factored invoice");

  // 2. identity defined as "every funded invoice".
  expectFail("pledged identity", {
    migrations: [...migrations, { name: "999999999999_planted.sql", text: `CREATE OR REPLACE FUNCTION accounting.${IDENTITY}(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT factoring_status <> 'not_factored' FROM accounting.invoices WHERE id = p $$;\n` }],
    sources,
  }, "factoring link");

  // 3. views.ar_aging re-created by status only.
  expectFail("view by status only", {
    migrations: [...migrations, { name: "999999999999_planted.sql", text: "CREATE OR REPLACE VIEW views.ar_aging WITH (security_invoker = true) AS SELECT 1 FROM accounting.invoices i WHERE i.status IN ('sent','partial');\n" }],
    sources,
  }, "views.ar_aging excludes factored invoices by status only");

  // 4. ar_aging_as_of re-created by status only.
  const asof = migrations.find((m) => m.name.startsWith("202612830000_"));
  expectFail("as_of by status only", { migrations: [...migrations, { name: "999999999999_planted.sql", text: asof.text }], sources }, "accounting.ar_aging_as_of() excludes factored");

  // 5. a reader that excludes 'factored' by status with no identity call.
  expectFail("reader by status only", {
    migrations,
    sources: [...sources, { path: "apps/backend/src/planted.ts", text: "const q = `SELECT 1 FROM accounting.invoices i WHERE i.status NOT IN ('void', 'factored')`;" }],
  }, "apps/backend/src/planted.ts");

  // 6. a real reader with its identity call stripped.
  const ar = sources.find((s) => s.path.endsWith("accounting/ar-aging.service.ts"));
  expectFail("ar-aging stripped", {
    migrations,
    sources: sources.map((s) => (s === ar ? { ...s, text: s.text.replace(/AND \$\{invoiceOnTradeArSql\("i"\)\}/g, "") } : s)),
  }, "accounting/ar-aging.service.ts");

  // 7. the cancellation gate back to status only.
  const cx = sources.find((s) => s.path.endsWith("dispatch/cancellation.service.ts"));
  expectFail("cancellation stripped", {
    migrations,
    sources: sources.map((s) => (s === cx ? { ...s, text: s.text.replace(/\$\{invoiceRecoursedOffTradeArSql\("accounting\.invoices"\)\} AS recoursed/, "false AS recoursed") } : s)),
  }, "dispatch/cancellation.service.ts");

  console.log(`[${LABEL}] selftest: PASS — real tree green; 7 planted defects caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = analyze({ migrations: readMigrations(), sources: readSources() });
  if (failures.length) {
    console.error(`[${LABEL}] FAIL\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — recompute_invoice_paid moves factored invoices to partial/paid; A/R readers use the factoring identity`);
}
