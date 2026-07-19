#!/usr/bin/env node
/**
 * CHAIN-06 — Invoice → A/R → Faro secured-borrowing chain proof (fail-closed).
 *
 * Accounting Core Block 25/67. Rule 17: auto-discovered via
 * scripts/verify-steps/912-verify-chain-06-invoice-ar-chain-proof.mjs.
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * This is NOT a thin wrapper around the orphaned advisory DB tie-out. It fail-closes on
 * filesystem/source contracts that prove the full chain remains wired:
 *   invoice issue (kill-switched) → A/R → Faro assignment/advance/reserve → customer payment
 *   → release → chargeback, with entity scope, flags default OFF, subledger + reserve movements,
 *   createJournalEntry audit/source-link spine, and behavioral tests for the acceptance matrix.
 *
 * Complements (does not duplicate) the already-live:
 *   - verify-chain-06-ar-subledger-fix.mjs (static subledger/reserve wiring)
 *   - verify-chain-06-factoring-ar-tieout.mjs (read-only DB Leg B/C)
 *   - verify-factoring-poster-secured-borrowing.mjs (per-leg role/direction contract)
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
  invoiceArFlagMigration: "db/migrations/202607011500_invoice_ar_gl_posting_flag.sql",
  factoringFlagMigration: "db/migrations/202607013000_factoring_secured_borrowing_coa_roles.sql",
  arSubledgerGuard: "scripts/verify-chain-06-ar-subledger-fix.mjs",
  tieoutGuard: "scripts/verify-chain-06-factoring-ar-tieout.mjs",
  securedBorrowingGuard: "scripts/verify-factoring-poster-secured-borrowing.mjs",
  chainProofTest: "apps/backend/src/accounting/factoring-posting/__tests__/chain-06-invoice-ar-chain-proof.test.ts",
  tieoutDbTest: "apps/backend/src/accounting/factoring-posting/__tests__/chain-06-factoring-ar-tieout.db.test.ts",
  invoiceKillswitchDbTest: "apps/backend/src/accounting/__tests__/invoice-ar-killswitch.db.test.ts",
};

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

/** @param {Record<string, string>} sources */
export function collectFailures(sources) {
  const failures = [];
  const require = (key, text, code) => {
    if (!sources[key] || !sources[key].includes(text)) failures.push(code);
  };
  const requireRe = (key, re, code) => {
    if (!sources[key] || !re.test(sources[key])) failures.push(code);
  };
  const forbidRe = (key, re, code) => {
    if (sources[key] && re.test(sources[key])) failures.push(code);
  };

  // ── Lifecycle functions (secured-borrowing chain) ──────────────────────────
  for (const fn of [
    "postFactoringAdvanceEvent",
    "postFactoringCustomerPaymentEvent",
    "postFactoringReleaseEvent",
    "postFactoringChargebackEvent",
  ]) {
    require("poster", `export async function ${fn}`, `poster_missing_${fn}`);
  }

  // Funding must never resolve/post ar_control; customer-payment + chargeback must.
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
    if (!/createJournalEntry\(/.test(funding) && !sources.poster.includes("createJournalEntry(")) {
      failures.push("funding_must_post_via_createJournalEntry");
    }
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
  else if (!/recordReserveMovement\s*\(/.test(release)) {
    failures.push("release_missing_reserve_released");
  }

  if (!chargeback) failures.push("poster_chargeback_fn_unparsed");
  else {
    if (!/resolveRoleAccount\([^)]*"ar_control"/.test(chargeback)) {
      failures.push("chargeback_must_relieve_ar_control");
    }
    if (!/applyChargebackSubledgerRelief\s*\(/.test(chargeback)) {
      failures.push("chargeback_missing_subledger_relief");
    }
  }

  // Entity scope + fail-closed advance load
  require("poster", "set_config('app.operating_company_id'", "poster_missing_entity_guc");
  require("poster", "operating_company_id = $2::uuid", "poster_advance_load_entity_scoped");
  require("poster", 'reason: "advance_not_found"', "poster_wrong_entity_fail_closed");
  require("poster", 'reason: "already_posted"', "poster_duplicate_link_idempotent");
  require("poster", "factoring_funding_figures_invalid", "poster_unbalanced_funding_fail_closed");
  require("poster", "!inv.voided_at", "poster_skips_voided_invoices");

  // Flags registered + default OFF (migrations) and listed in feature-flag service
  require("featureFlags", "FACTORING_GL_POSTING_ENABLED", "feature_flags_missing_factoring");
  require("featureFlags", "INVOICE_AR_GL_POSTING_ENABLED", "feature_flags_missing_invoice_ar");
  require("invoiceArFlagMigration", "INVOICE_AR_GL_POSTING_ENABLED", "invoice_ar_flag_migration_missing");
  requireRe(
    "invoiceArFlagMigration",
    /INVOICE_AR_GL_POSTING_ENABLED[\s\S]{0,400}false/i,
    "invoice_ar_flag_must_default_off"
  );
  require("factoringFlagMigration", "FACTORING_GL_POSTING_ENABLED", "factoring_flag_migration_missing");
  requireRe(
    "factoringFlagMigration",
    /FACTORING_GL_POSTING_ENABLED[\s\S]{0,400}false/i,
    "factoring_flag_must_default_off"
  );
  forbidRe(
    "featureFlags",
    /FACTORING_GL_POSTING_ENABLED["']\s*,\s*true/,
    "factoring_flag_must_not_default_true_in_service"
  );

  // Invoice → A/R kill switch on posting engine (chain leg 1)
  require("postingEngine", "buildInvoiceLines", "invoice_ar_builder_missing");
  require("postingEngine", "invoiceArPostingEnabled", "invoice_ar_killswitch_missing");
  require("postingRoutes", "INVOICE_AR_GL_POSTING_ENABLED", "invoice_ar_route_flag_missing");

  // Audit + source-link spine via createJournalEntry (forward/reverse for JE lines)
  require("journalEntries", "writeTransactionSourceLink", "je_missing_source_link_writer");
  require("journalEntries", "appendCrudAudit", "je_missing_audit");
  require("journalEntries", "accounting.journal_entry.created", "je_missing_created_audit_event");
  require("poster", "createJournalEntry", "poster_must_use_createJournalEntry");

  // Source invoice / load / customer / factor linkage surfaces (routes + invoice FK)
  require("factoringRoutes", "factoring_advance_id", "routes_missing_advance_invoice_link");
  require("factoringRoutes", "customer_id", "routes_missing_customer_link");
  require("factoringRoutes", "mdata.customers", "routes_missing_customer_join");
  require("poster", "FROM accounting.invoices", "poster_loads_source_invoices");
  require("poster", "factoring_advance_id", "poster_invoice_advance_fk");

  // Companion guards must remain present (wired separately via verify-steps — not re-executed here)
  require("arSubledgerGuard", "applyCustomerPaymentSubledgerRelief", "ar_subledger_guard_missing");
  require("tieoutGuard", "legB_fundingTouchesAr", "tieout_guard_missing_leg_b");
  require("tieoutGuard", "legC_liabilityRoundTrip", "tieout_guard_missing_leg_c");
  require("securedBorrowingGuard", "LEG_CONTRACT", "secured_borrowing_guard_missing");

  // Behavioral + DB acceptance matrix must stay named in tests
  const behavioralMarkers = [
    ["normal_lifecycle", /normal.?lifecycle|funding.?->.?customer.?payment|full.?chain/i],
    ["missing_link", /missing.?link|advance_not_found|no_invoices/i],
    ["duplicate_link", /duplicate.?link|already_posted/i],
    ["wrong_entity", /wrong.?entity|cross.?entity|tenant.?isolation|operating_company_id/i],
    ["unbalanced_wrong_account", /unbalanced|wrong.?account|funding_figures_invalid|resolveRoleAccount/i],
    ["chargeback", /chargeback/i],
    ["voided", /voided/i],
    ["planted_guard_failure", /planted|selftest|self-test/i],
  ];
  for (const [code, re] of behavioralMarkers) {
    const hay = `${sources.chainProofTest}\n${sources.tieoutDbTest}\n${sources.invoiceKillswitchDbTest}`;
    if (!re.test(hay)) failures.push(`behavioral_test_missing_${code}`);
  }

  // Invoice kill-switch DB proof remains
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
`,
    invoiceArFlagMigration: `INVOICE_AR_GL_POSTING_ENABLED',\n  'desc',\n  false`,
    factoringFlagMigration: `FACTORING_GL_POSTING_ENABLED',\n  'desc',\n  false`,
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
planted guard failure selftest
`,
    tieoutDbTest: `Leg B\nLeg C`,
    invoiceKillswitchDbTest: `INVOICE_AR_GL_POSTING_ENABLED`,
  };
}

function buildBadFixture() {
  // Planted defect: funding CREDITS ar_control (sale-model regression) + missing kill switch + flag ON.
  const good = buildGoodFixture();
  return {
    ...good,
    poster: `
export async function postFactoringAdvanceEvent() {
  const arAccountId = await resolveRoleAccount(client, opco, "ar_control");
  const cashAccountId = await resolveRoleAccount(client, opco, "cash_clearing");
  postings.push({ account_id: arAccountId, debit_or_credit: "credit" });
  await createJournalEntry({ postings });
}
export async function postFactoringCustomerPaymentEvent() {}
export async function postFactoringReleaseEvent() {}
export async function postFactoringChargebackEvent() {}
`,
    postingEngine: `async function buildInvoiceLines() {}`,
    invoiceArFlagMigration: `INVOICE_AR_GL_POSTING_ENABLED',\n  'desc',\n  true`,
    chainProofTest: `// empty — planted missing behavioral matrix`,
  };
}

runExecutableGuard({
  label: LABEL,
  checker: collectFailures,
  loadRepositoryFixture,
  goodFixture: buildGoodFixture(),
  badFixture: buildBadFixture(),
  expectedBadViolationSubstrings: [
    "funding_must_not_resolve_ar_control",
    "invoice_ar_killswitch_missing",
    "invoice_ar_flag_must_default_off",
    "behavioral_test_missing_normal_lifecycle",
  ],
});
