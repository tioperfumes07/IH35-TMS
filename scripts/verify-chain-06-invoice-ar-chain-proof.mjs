#!/usr/bin/env node
/**
 * CHAIN-06 — Invoice → A/R → Faro secured-borrowing chain proof (fail-closed).
 *
 * Accounting Core Block 25/67. Rule 17: auto-discovered via
 * scripts/verify-steps/920-verify-chain-06-invoice-ar-chain-proof.mjs
 * (IDs 920–923 chosen to avoid collisions with open PRs #2714/#2716/#2717 and other 912s).
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * Scope of THIS guard (static filesystem contract + planted selftest):
 *   - Invoice A/R kill-switch wiring + money flags default_enabled=false (literal INSERT parse)
 *   - Faro poster lifecycle functions, entity GUC, subledger/reserve wiring, JE audit/source-link spine
 *   - Source invoice / load / customer / factor surface markers
 *   - Companion guards present; behavioral test matrix named
 *
 * Runtime Leg B/C / kill-switch Postgres proofs remain in existing
 * chain-06-factoring-ar-tieout.db.test.ts + invoice-ar-killswitch.db.test.ts (CI-only).
 * This PR does NOT claim live Neon posting proof.
 *
 * Usage:
 *   node scripts/verify-chain-06-invoice-ar-chain-proof.mjs
 *   node scripts/verify-chain-06-invoice-ar-chain-proof.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LABEL = "verify-chain-06-invoice-ar-chain-proof";

const PATHS = {
  poster: "apps/backend/src/accounting/factoring-posting/poster.service.ts",
  postingEngine: "apps/backend/src/accounting/posting-engine.service.ts",
  postingRoutes: "apps/backend/src/accounting/posting-engine.routes.ts",
  journalEntries: "apps/backend/src/accounting/journal-entries.service.ts",
  featureFlags: "apps/backend/src/lib/feature-flags/service.ts",
  factoringRoutes: "apps/backend/src/accounting/factoring-advances.routes.ts",
  invoicesRoutes: "apps/backend/src/accounting/invoices.routes.ts",
  invoiceArFlagMigration: "db/migrations/202607011500_invoice_ar_gl_posting_flag.sql",
  factoringFlagMigration: "db/migrations/202607013000_factoring_secured_borrowing_coa_roles.sql",
  arSubledgerGuard: "scripts/verify-chain-06-ar-subledger-fix.mjs",
  tieoutGuard: "scripts/verify-chain-06-factoring-ar-tieout.mjs",
  securedBorrowingGuard: "scripts/verify-factoring-poster-secured-borrowing.mjs",
  chainProofTest: "apps/backend/src/accounting/factoring-posting/__tests__/chain-06-invoice-ar-chain-proof.test.ts",
  tieoutDbTest: "apps/backend/src/accounting/factoring-posting/__tests__/chain-06-factoring-ar-tieout.db.test.ts",
  invoiceKillswitchDbTest: "apps/backend/src/accounting/__tests__/invoice-ar-killswitch.db.test.ts",
};

/** Strip SQL comments so prose like "-- Default OFF" / "-- true in future" cannot satisfy checks. */
function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "\n");
}

/** Skip whitespace in SQL body; returns new index. */
function skipWs(body, i) {
  while (i < body.length && /\s/.test(body[i])) i += 1;
  return i;
}

/**
 * Parse one SQL scalar value starting at `i` (string / bool / number / NULL / ident).
 * String concatenations via `||` collapse to a single string value.
 * Returns { value, kind: 'string'|'bool'|'other', end }.
 */
function parseSqlScalar(body, i) {
  i = skipWs(body, i);
  if (i >= body.length) return { value: null, kind: "other", end: i };

  if (body[i] === "'") {
    let s = "";
    let j = i + 1;
    while (j < body.length) {
      if (body[j] === "'" && body[j + 1] === "'") {
        s += "'";
        j += 2;
        continue;
      }
      if (body[j] === "'") {
        j += 1;
        break;
      }
      s += body[j];
      j += 1;
    }
    j = skipWs(body, j);
    while (body.slice(j, j + 2) === "||") {
      j = skipWs(body, j + 2);
      const next = parseSqlScalar(body, j);
      if (next.kind === "string") s += next.value;
      j = next.end;
      j = skipWs(body, j);
    }
    return { value: s, kind: "string", end: j };
  }

  const bool = body.slice(i).match(/^(true|false)\b/i);
  if (bool) {
    return {
      value: bool[1].toLowerCase() === "true",
      kind: "bool",
      end: i + bool[1].length,
    };
  }

  const nul = body.slice(i).match(/^null\b/i);
  if (nul) return { value: null, kind: "other", end: i + nul[0].length };

  const num = body.slice(i).match(/^-?\d+(\.\d+)?\b/);
  if (num) return { value: num[0], kind: "other", end: i + num[0].length };

  // Bare identifier / function call — skip conservatively to next comma/paren.
  let j = i;
  let depth = 0;
  while (j < body.length) {
    const ch = body[j];
    if (ch === "(") {
      depth += 1;
      j += 1;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) break;
      depth -= 1;
      j += 1;
      continue;
    }
    if ((ch === "," || ch === ";") && depth === 0) break;
    j += 1;
  }
  return { value: body.slice(i, j).trim(), kind: "other", end: j };
}

/** Parse `(a, b, c)` tuple values; returns { values, end } or null. */
function parseParenTuple(body, i) {
  i = skipWs(body, i);
  if (body[i] !== "(") return null;
  i += 1;
  const values = [];
  i = skipWs(body, i);
  if (body[i] === ")") return { values, end: i + 1 };
  while (i < body.length) {
    const v = parseSqlScalar(body, i);
    values.push(v);
    i = skipWs(body, v.end);
    if (body[i] === ",") {
      i += 1;
      continue;
    }
    if (body[i] === ")") return { values, end: i + 1 };
    break;
  }
  return null;
}

/**
 * Extract column name list after INSERT INTO lib.feature_flags, if present.
 * Returns { cols: string[]|null, end } where end is index after optional `(...)`.
 */
function parseInsertColumnList(body, i) {
  i = skipWs(body, i);
  if (body[i] !== "(") return { cols: null, end: i };
  const tuple = parseParenTuple(body, i);
  if (!tuple) return { cols: null, end: i };
  const cols = tuple.values.map((v) => String(v.value || "").toLowerCase().trim());
  return { cols, end: tuple.end };
}

/**
 * Default column order when INSERT omits an explicit list (matches CHAIN-06 seeds).
 */
const DEFAULT_FEATURE_FLAG_COLS = ["flag_key", "description", "default_enabled"];

/**
 * Yield every `INSERT INTO lib.feature_flags` statement's (flag_key → default_enabled)
 * bindings. SELECT decoys, comments, and unrelated-table INSERTs are ignored.
 *
 * Fail-closed semantics for money flags: if multiple matching tuples exist, any
 * `true` wins; otherwise the last parsed boolean for that key is returned.
 */
function* iterFeatureFlagInsertDefaults(sql) {
  const body = stripSqlComments(sql);
  const insertRe = /INSERT\s+INTO\s+lib\.feature_flags\b/gi;
  let m;
  while ((m = insertRe.exec(body)) !== null) {
    let i = m.index + m[0].length;
    const { cols: explicitCols, end: afterCols } = parseInsertColumnList(body, i);
    i = afterCols;
    i = skipWs(body, i);
    const valuesKw = body.slice(i).match(/^VALUES\b/i);
    if (!valuesKw) continue;
    i += valuesKw[0].length;

    const cols = explicitCols && explicitCols.length > 0 ? explicitCols : DEFAULT_FEATURE_FLAG_COLS;
    const keyIdx = cols.indexOf("flag_key");
    const enabledIdx = cols.indexOf("default_enabled");
    if (keyIdx < 0 || enabledIdx < 0) continue;

    // Parse one or more value tuples until ON CONFLICT / ; / end.
    while (i < body.length) {
      i = skipWs(body, i);
      if (/^ON\s+CONFLICT\b/i.test(body.slice(i)) || body[i] === ";") break;
      if (body[i] !== "(") break;
      const tuple = parseParenTuple(body, i);
      if (!tuple) break;
      i = tuple.end;
      const keyVal = tuple.values[keyIdx];
      const enVal = tuple.values[enabledIdx];
      if (keyVal?.kind === "string" && enVal?.kind === "bool") {
        yield { flagKey: keyVal.value, defaultEnabled: enVal.value === true };
      }
      i = skipWs(body, i);
      if (body[i] === ",") {
        i += 1;
        continue;
      }
      break;
    }
  }
}

/**
 * Parse lib.feature_flags INSERT default_enabled for a flag_key.
 *
 * Only binds to actual `INSERT INTO lib.feature_flags (...) VALUES (...)` tuples.
 * Respects explicit column order; handles multi-row VALUES lists.
 * Comments / SELECT decoys / unrelated-table INSERTs never satisfy or mask.
 *
 * Returns true | false | null (unparseable / absent).
 * Fail-closed: any matching INSERT tuple with default_enabled=true → true.
 */
export function parseFeatureFlagDefaultEnabled(sql, flagKey) {
  let sawFalse = false;
  let sawTrue = false;
  for (const row of iterFeatureFlagInsertDefaults(sql)) {
    if (row.flagKey !== flagKey) continue;
    if (row.defaultEnabled === true) sawTrue = true;
    else sawFalse = true;
  }
  if (sawTrue) return true;
  if (sawFalse) return false;
  return null;
}

function readRel(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

function extractFn(src, name) {
  const startRe = new RegExp(`export async function ${name}\\b`);
  const m = startRe.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + m[0].length);
  const nextExport = /\nexport (?:async function|type|const|class)\b/.exec(rest);
  return rest.slice(0, nextExport ? nextExport.index : rest.length);
}

function assertMoneyFlagDefaultOff(failures, sql, flagKey, codePrefix) {
  const enabled = parseFeatureFlagDefaultEnabled(sql, flagKey);
  if (enabled === null) {
    failures.push(`${codePrefix}_default_enabled_unparseable`);
    return;
  }
  if (enabled === true) {
    failures.push(`${codePrefix}_default_enabled_true`);
    failures.push(`${codePrefix}_must_default_off`);
    return;
  }
  // enabled === false → OK
}

/** @param {Record<string, string>} sources */
export function collectFailures(sources) {
  const failures = [];
  const require = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };

  for (const fn of [
    "postFactoringAdvanceEvent",
    "postFactoringCustomerPaymentEvent",
    "postFactoringReleaseEvent",
    "postFactoringChargebackEvent",
  ]) {
    require("poster", `export async function ${fn}`, `poster_missing_${fn}`);
  }

  const funding = extractFn(sources.poster || "", "postFactoringAdvanceEvent") || "";
  const customerPay = extractFn(sources.poster || "", "postFactoringCustomerPaymentEvent") || "";
  const release = extractFn(sources.poster || "", "postFactoringReleaseEvent") || "";
  const chargeback = extractFn(sources.poster || "", "postFactoringChargebackEvent") || "";

  if (!funding) failures.push("poster_funding_fn_unparsed");
  else {
    if (/resolveRoleAccount\([^)]*"ar_control"/.test(funding)) {
      failures.push("funding_must_not_resolve_ar_control");
    }
    if (!/factoringPostingEnabled\(/.test(funding)) failures.push("funding_missing_flag_gate");
    if (!/recordReserveMovement\s*\(/.test(funding)) failures.push("funding_missing_reserve_held");
    if (!/createJournalEntry\(/.test(funding)) failures.push("funding_must_post_via_createJournalEntry");
  }

  if (!customerPay) failures.push("poster_customer_payment_fn_unparsed");
  else {
    if (!/resolveRoleAccount\([^)]*"ar_control"/.test(customerPay)) {
      failures.push("customer_payment_must_credit_ar_control");
    }
    if (!/applyCustomerPaymentSubledgerRelief\s*\(/.test(customerPay)) {
      failures.push("customer_payment_missing_subledger_relief");
    }
    if (!/factoringPostingEnabled\(/.test(customerPay)) failures.push("customer_payment_missing_flag_gate");
  }

  if (!release) failures.push("poster_release_fn_unparsed");
  else {
    if (!/recordReserveMovement\s*\(/.test(release)) failures.push("release_missing_reserve_released");
    if (!/factoringPostingEnabled\(/.test(release)) failures.push("release_missing_flag_gate");
  }

  if (!chargeback) failures.push("poster_chargeback_fn_unparsed");
  else {
    if (!/resolveRoleAccount\([^)]*"ar_control"/.test(chargeback)) {
      failures.push("chargeback_must_relieve_ar_control");
    }
    if (!/applyChargebackSubledgerRelief\s*\(/.test(chargeback)) {
      failures.push("chargeback_missing_subledger_relief");
    }
    if (!/factoringPostingEnabled\(/.test(chargeback)) failures.push("chargeback_missing_flag_gate");
  }

  // Entity scope + fail-closed gates
  require("poster", "set_config('app.operating_company_id'", "poster_missing_entity_guc");
  require("poster", "operating_company_id = $2::uuid", "poster_advance_load_entity_scoped");
  require("poster", 'reason: "advance_not_found"', "poster_wrong_entity_fail_closed");
  require("poster", 'reason: "already_posted"', "poster_duplicate_link_idempotent");
  require("poster", "factoring_funding_figures_invalid", "poster_unbalanced_funding_fail_closed");
  require("poster", "!inv.voided_at", "poster_skips_voided_invoices");

  // Feature-flag service registry
  require("featureFlags", "FACTORING_GL_POSTING_ENABLED", "feature_flags_missing_factoring");
  require("featureFlags", "INVOICE_AR_GL_POSTING_ENABLED", "feature_flags_missing_invoice_ar");

  // Money flags: parse real INSERT default_enabled literal (comments ignored)
  require("invoiceArFlagMigration", "INVOICE_AR_GL_POSTING_ENABLED", "invoice_ar_flag_migration_missing");
  require("factoringFlagMigration", "FACTORING_GL_POSTING_ENABLED", "factoring_flag_migration_missing");
  assertMoneyFlagDefaultOff(failures, sources.invoiceArFlagMigration, "INVOICE_AR_GL_POSTING_ENABLED", "invoice_ar_flag");
  assertMoneyFlagDefaultOff(failures, sources.factoringFlagMigration, "FACTORING_GL_POSTING_ENABLED", "factoring_flag");

  // Invoice → A/R kill switch
  require("postingEngine", "buildInvoiceLines", "invoice_ar_builder_missing");
  require("postingEngine", "invoiceArPostingEnabled", "invoice_ar_killswitch_missing");
  require("postingRoutes", "INVOICE_AR_GL_POSTING_ENABLED", "invoice_ar_route_flag_missing");

  // Audit + source-link spine
  require("journalEntries", "writeTransactionSourceLink", "je_missing_source_link_writer");
  require("journalEntries", "appendCrudAudit", "je_missing_audit");
  require("journalEntries", "accounting.journal_entry.created", "je_missing_created_audit_event");
  require("poster", "createJournalEntry", "poster_must_use_createJournalEntry");

  // Source invoice / load / customer / factor linkage surfaces
  require("factoringRoutes", "factoring_advance_id", "routes_missing_advance_invoice_link");
  require("factoringRoutes", "customer_id", "routes_missing_customer_link");
  require("factoringRoutes", "mdata.customers", "routes_missing_customer_join");
  require("factoringRoutes", "factoring_company_vendor_id", "routes_missing_factor_vendor_link");
  require("factoringRoutes", "mdata.vendors", "routes_missing_factor_vendor_join");
  require("invoicesRoutes", "source_load_id", "invoices_missing_source_load_link");
  require("invoicesRoutes", "mdata.loads", "invoices_missing_load_join");
  require("poster", "FROM accounting.invoices", "poster_loads_source_invoices");
  require("poster", "factoring_advance_id", "poster_invoice_advance_fk");

  // Companion guards present (wired via verify-steps 921–923)
  require("arSubledgerGuard", "applyCustomerPaymentSubledgerRelief", "ar_subledger_guard_missing");
  require("tieoutGuard", "legB_fundingTouchesAr", "tieout_guard_missing_leg_b");
  require("tieoutGuard", "legC_liabilityRoundTrip", "tieout_guard_missing_leg_c");
  require("securedBorrowingGuard", "LEG_CONTRACT", "secured_borrowing_guard_missing");

  const behavioralMarkers = [
    ["normal_lifecycle", /normal.?lifecycle|funding.?->.?customer.?payment|full.?chain/i],
    ["missing_link", /missing.?link|advance_not_found|no_invoices/i],
    ["duplicate_link", /duplicate.?link|already_posted/i],
    ["wrong_entity", /wrong.?entity|cross.?entity|tenant.?isolation|operating_company_id/i],
    ["unbalanced_wrong_account", /unbalanced|wrong.?account|funding_figures_invalid|resolveRoleAccount/i],
    ["chargeback", /chargeback/i],
    ["voided", /voided/i],
    ["planted_guard_failure", /collectFailures|parseFeatureFlagDefaultEnabled|--selftest|spawnSync/i],
    ["je_balance_roles", /debit.?=.?credit|sum\(.*debit|debit_or_credit/i],
  ];
  for (const [code, re] of behavioralMarkers) {
    const hay = `${sources.chainProofTest}\n${sources.tieoutDbTest}\n${sources.invoiceKillswitchDbTest}`;
    if (!re.test(hay)) failures.push(`behavioral_test_missing_${code}`);
  }

  require("invoiceKillswitchDbTest", "INVOICE_AR_GL_POSTING_ENABLED", "invoice_killswitch_db_test_missing");
  require("tieoutDbTest", "Leg B", "tieout_db_test_missing_leg_b");
  require("tieoutDbTest", "Leg C", "tieout_db_test_missing_leg_c");

  return failures;
}

function loadRepositoryFixture() {
  const out = {};
  for (const [key, rel] of Object.entries(PATHS)) {
    out[key] = readRel(ROOT, rel);
  }
  return out;
}

const GOOD_MIGRATION_INVOICE = `
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'INVOICE_AR_GL_POSTING_ENABLED',
  'CHAIN-06 invoice A/R kill switch',
  false
)
ON CONFLICT (flag_key) DO NOTHING;
`;

const GOOD_MIGRATION_FACTORING = `
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'FACTORING_GL_POSTING_ENABLED',
  'CODER-34 factoring secured-borrowing GL posting',
  false
)
ON CONFLICT (flag_key) DO NOTHING;
`;

function buildGoodFixture() {
  return {
    poster: `
export async function postFactoringAdvanceEvent() {
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [opco]);
  if (!(await factoringPostingEnabled(client, opco))) return { gate: "flag_off" };
  const advance = await loadAdvance(); // WHERE operating_company_id = $2::uuid
  if (!advance) return { gate: "advance_not_found" as const, reason: "advance_not_found" };
  if (await journalEntryExistsByMemo()) return { gate: "already_posted" as const, reason: "already_posted" };
  if (cash < 0) throw new Error("factoring_funding_figures_invalid: ...");
  const cashAccountId = await resolveRoleAccount(client, opco, "cash_clearing");
  const reserveAccountId = await resolveRoleAccount(client, opco, "factor_reserve_held");
  const feeAccountId = await resolveRoleAccount(client, opco, "factor_fee_expense");
  const liabilityAccountId = await resolveRoleAccount(client, opco, "factoring_advance_liability");
  await createJournalEntry({ postings });
  await recordReserveMovement(client, opco, id, "held", reserve, date, jeId);
}
export async function postFactoringCustomerPaymentEvent() {
  if (!(await factoringPostingEnabled(client, opco))) return { gate: "flag_off" };
  const liabilityAccountId = await resolveRoleAccount(client, opco, "factoring_advance_liability");
  const arAccountId = await resolveRoleAccount(client, opco, "ar_control");
  await createJournalEntry({ postings });
  await applyCustomerPaymentSubledgerRelief(client, opco, id, amount);
}
export async function postFactoringReleaseEvent() {
  if (!(await factoringPostingEnabled(client, opco))) return { gate: "flag_off" };
  await createJournalEntry({ postings });
  await recordReserveMovement(client, opco, id, "released", amount, date, jeId);
}
export async function postFactoringChargebackEvent() {
  if (!(await factoringPostingEnabled(client, opco))) return { gate: "flag_off" };
  const arAccountId = await resolveRoleAccount(client, opco, "ar_control");
  await createJournalEntry({ postings });
  await applyChargebackSubledgerRelief(client, opco, id);
}
async function applyCustomerPaymentSubledgerRelief() {
  const invoices = (await loadAdvanceInvoices()).filter((inv) => !inv.voided_at);
  SELECT id FROM accounting.invoices WHERE factoring_advance_id = $1
}
`,
    postingEngine: `async function buildInvoiceLines() {}\nif (sourceType === "invoice" && input.invoiceArPostingEnabled !== true)`,
    postingRoutes: `INVOICE_AR_GL_POSTING_ENABLED`,
    journalEntries: `
await writeTransactionSourceLink(client, {});
await appendCrudAudit(client, actor.userId, "accounting.journal_entry.created", {});
`,
    featureFlags: `FACTORING_GL_POSTING_ENABLED\nINVOICE_AR_GL_POSTING_ENABLED`,
    factoringRoutes: `
i.customer_id
JOIN mdata.customers c ON c.id = i.customer_id
WHERE i.factoring_advance_id = $1
factoring_company_vendor_id
JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
`,
    invoicesRoutes: `
LEFT JOIN mdata.loads l ON l.id = i.source_load_id
source_load_id
`,
    invoiceArFlagMigration: GOOD_MIGRATION_INVOICE,
    factoringFlagMigration: GOOD_MIGRATION_FACTORING,
    arSubledgerGuard: `applyCustomerPaymentSubledgerRelief`,
    tieoutGuard: `legB_fundingTouchesAr\nlegC_liabilityRoundTrip`,
    securedBorrowingGuard: `LEG_CONTRACT`,
    chainProofTest: `
normal lifecycle funding -> customer payment full chain
missing link advance_not_found
duplicate link already_posted
wrong entity cross-entity tenant isolation operating_company_id
unbalanced wrong account funding_figures_invalid resolveRoleAccount
chargeback
voided
collectFailures parseFeatureFlagDefaultEnabled --selftest spawnSync
debit = credit sum(debit) debit_or_credit
`,
    tieoutDbTest: `Leg B\nLeg C`,
    invoiceKillswitchDbTest: `INVOICE_AR_GL_POSTING_ENABLED`,
  };
}

/**
 * Plant EVERY critical violation independently so --selftest asserts each substring.
 * Comments claiming "false" / "Default OFF" must NOT satisfy the literal parser.
 */
function buildBadFixture() {
  const good = buildGoodFixture();
  return {
    ...good,
    poster: `
export async function postFactoringAdvanceEvent() {
  // missing entity GUC + funding resolves ar_control (sale-model)
  const arAccountId = await resolveRoleAccount(client, opco, "ar_control");
  const cashAccountId = await resolveRoleAccount(client, opco, "cash_clearing");
  postings.push({ account_id: arAccountId, debit_or_credit: "credit" });
  // no createJournalEntry, no reserve movement, no flag gate
}
export async function postFactoringCustomerPaymentEvent() {
  // missing ar_control credit + missing subledger relief + missing flag gate
  const liabilityAccountId = await resolveRoleAccount(client, opco, "factoring_advance_liability");
  await createJournalEntry({ postings });
}
export async function postFactoringReleaseEvent() {
  // missing reserve released + missing flag gate
  await createJournalEntry({ postings });
}
export async function postFactoringChargebackEvent() {
  // missing ar_control + missing chargeback subledger relief + missing flag gate
  await createJournalEntry({ postings });
}
`,
    postingEngine: `async function buildInvoiceLines() {}`,
    journalEntries: `// planted: JE spine helpers deliberately absent`,
    invoiceArFlagMigration: `
-- Default OFF (comment must not count)
SELECT 'INVOICE_AR_GL_POSTING_ENABLED','decoy',false;
INSERT INTO other.feature_flags (flag_key, description, default_enabled)
VALUES ('INVOICE_AR_GL_POSTING_ENABLED', 'wrong table', false);
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'INVOICE_AR_GL_POSTING_ENABLED',
  'planted ON',
  true
);
`,
    factoringFlagMigration: `
-- false in a comment only
SELECT 'FACTORING_GL_POSTING_ENABLED','decoy',false;
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'FACTORING_GL_POSTING_ENABLED',
  'planted ON — comment/SELECT decoy must not satisfy parser',
  true
);
`,
    arSubledgerGuard: `// planted: companion subledger guard body emptied`,
    securedBorrowingGuard: `// planted: per-leg contract marker removed`,
    chainProofTest: `// planted: behavioral matrix emptied`,
    factoringRoutes: `// planted: customer/factor joins removed`,
    invoicesRoutes: `// planted: load join removed`,
  };
}

/** Critical codes that must each be independently planted by the bad fixture. */
export const CRITICAL_PLANTED_VIOLATIONS = [
  "funding_must_not_resolve_ar_control",
  "funding_missing_flag_gate",
  "funding_missing_reserve_held",
  "funding_must_post_via_createJournalEntry",
  "customer_payment_must_credit_ar_control",
  "customer_payment_missing_subledger_relief",
  "release_missing_reserve_released",
  "chargeback_must_relieve_ar_control",
  "chargeback_missing_subledger_relief",
  "poster_missing_entity_guc",
  "invoice_ar_killswitch_missing",
  "invoice_ar_flag_default_enabled_true",
  "invoice_ar_flag_must_default_off",
  "factoring_flag_default_enabled_true",
  "factoring_flag_must_default_off",
  "je_missing_source_link_writer",
  "je_missing_audit",
  "ar_subledger_guard_missing",
  "secured_borrowing_guard_missing",
  "routes_missing_customer_link",
  "routes_missing_factor_vendor_link",
  "invoices_missing_source_load_link",
  "behavioral_test_missing_normal_lifecycle",
];

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runExecutableGuard({
    label: LABEL,
    checker: collectFailures,
    loadRepositoryFixture,
    goodFixture: buildGoodFixture(),
    badFixture: buildBadFixture(),
    expectedBadViolationSubstrings: CRITICAL_PLANTED_VIOLATIONS,
  });
}
