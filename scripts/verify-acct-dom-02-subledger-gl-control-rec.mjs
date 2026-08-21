#!/usr/bin/env node
/**
 * ACCT-DOM-02 — standing sub-ledger ↔ GL control-account reconciliation guard.
 *
 * READ-ONLY surface: ties AR/AP/escrow/factoring subledgers to designated control roles per entity.
 * No posting, no dollar threshold (RECON-01). Static guard + seeded fixture selftest.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = path.join(ROOT, "apps/backend/src/accounting/subledger-gl-control-rec.service.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/accounting/subledger-gl-control-rec.routes.ts");

/** Seeded fixture — must match buildSubledgerGlControlRecRow in the service (pure logic). */
const FIXTURE_ROWS = [
  {
    role: "ar_control",
    control_account_id: "aaaaaaaa-0001-4000-8000-000000000001",
    control_balance_cents: 385_00,
    subledger_balance_cents: 385_00,
    subledger_source: "fixture:transp-ar",
    expect_status: "tied",
    expect_variance: 0,
  },
  {
    role: "ap_control",
    control_account_id: "aaaaaaaa-0002-4000-8000-000000000002",
    control_balance_cents: 515_00,
    subledger_balance_cents: 514_00,
    subledger_source: "fixture:transp-ap",
    expect_status: "variance",
    expect_variance: 100,
  },
  {
    role: "escrow_liability_default",
    control_account_id: "bbbbbbbb-0003-4000-8000-000000000003",
    control_balance_cents: 80_00,
    subledger_balance_cents: 80_00,
    subledger_source: "fixture:usmca-escrow",
    expect_status: "tied",
    expect_variance: 0,
  },
  {
    role: "factoring_advance_liability",
    control_account_id: "bbbbbbbb-0004-4000-8000-000000000004",
    control_balance_cents: 1_250_000,
    subledger_balance_cents: 1_250_000,
    subledger_source: "fixture:usmca-factoring",
    expect_status: "tied",
    expect_variance: 0,
  },
];

/** Mirror of deriveSubledgerGlControlRecStatus / buildSubledgerGlControlRecRow — keep in sync. */
function buildFixtureRow(input) {
  const control = input.control_balance_cents ?? 0;
  const variance_cents = control - input.subledger_balance_cents;
  const status = variance_cents === 0 ? "tied" : "variance";
  return {
    role: input.role,
    control_account_id: input.control_account_id,
    control_balance_cents: input.control_balance_cents,
    subledger_balance_cents: input.subledger_balance_cents,
    variance_cents,
    status,
    subledger_source: input.subledger_source,
  };
}

function runSelftest() {
  for (const fixture of FIXTURE_ROWS) {
    const row = buildFixtureRow(fixture);
    if (row.status !== fixture.expect_status) {
      throw new Error(`fixture ${fixture.role}: expected status ${fixture.expect_status}, got ${row.status}`);
    }
    if (row.variance_cents !== fixture.expect_variance) {
      throw new Error(
        `fixture ${fixture.role}: expected variance ${fixture.expect_variance}, got ${row.variance_cents}`
      );
    }
  }
  // RECON-01 — 1 cent variance must flag (no threshold).
  const oneCent = buildFixtureRow({
    role: "ar_control",
    control_account_id: "x",
    control_balance_cents: 100,
    subledger_balance_cents: 99,
    subledger_source: "selftest",
  });
  if (oneCent.status !== "variance" || oneCent.variance_cents !== 1) {
    throw new Error("RECON-01 violation: 1-cent variance must flag as variance");
  }
  console.log("[acct-dom-02-subledger-gl-control-rec] --selftest OK (TRANSP + USMCA fixture rows)");
}

function runStaticGuard() {
  const failures = [];
  let service = "";
  let routes = "";
  try {
    service = fs.readFileSync(SERVICE, "utf8");
  } catch {
    failures.push("missing subledger-gl-control-rec.service.ts");
  }
  try {
    routes = fs.readFileSync(ROUTES, "utf8");
  } catch {
    failures.push("missing subledger-gl-control-rec.routes.ts");
  }
  if (failures.length) return failures;

  for (const role of ["ar_control", "ap_control", "escrow_liability_default", "factoring_advance_liability"]) {
    if (!service.includes(`"${role}"`)) failures.push(`service missing control role ${role}`);
  }
  if (!/resolveRoleAccountOptional/.test(service)) {
    failures.push("service must resolve control roles via resolveRoleAccountOptional");
  }
  if (!/fn_account_balances_as_of/.test(service)) {
    failures.push("service must read GL control balance from accounting.fn_account_balances_as_of");
  }
  if (!/getArAgingReport/.test(service) || !/getApAgingReport/.test(service)) {
    failures.push("service must reuse AR/AP aging read services for subledger totals");
  }
  if (!/escrow_accounts/.test(service)) {
    failures.push("service must sum accounting.escrow_accounts for escrow subledger");
  }
  if (!/computeFactoringBalanceInvoiceLinkage/.test(service)) {
    failures.push("service must use factoring balance linkage for factoring liability subledger");
  }
  if (!/deriveSubledgerGlControlRecStatus/.test(service) || !/buildSubledgerGlControlRecRow/.test(service)) {
    failures.push("service must export pure derive/build helpers for guard parity");
  }
  if (/insert\s+into|update\s+\w+\.|delete\s+from/i.test(service)) {
    failures.push("service must be READ-ONLY (no INSERT/UPDATE/DELETE)");
  }
  if (/postJournalEntry|createJournalEntry|posting-engine/i.test(service)) {
    failures.push("service must not post to the ledger");
  }
  if (!/varianceCents === 0|variance_cents === 0/.test(service)) {
    failures.push("service must use exact-zero tie (RECON-01 — no dollar threshold)");
  }
  // ACCT-F5695 — fn_account_balances_as_of.closing_balance_cents is DEBIT-POSITIVE regardless of
  // the account's own normal_balance; a credit-normal control account (Liability: ap_control,
  // escrow_liability_default, factoring_advance_liability) must have its sign flipped before being
  // compared against a subledger figure expressed as a positive magnitude, or every credit-normal
  // row reports a variance double the real dollar amount, sign-inverted. Live-verified on USMCA:
  // ap_control read control=-$123.45 vs subledger=+$123.45, the exact signature this bug predicts.
  if (!/normal_balance/.test(service)) {
    failures.push(
      "service must read normal_balance from fn_account_balances_as_of and flip sign for " +
        "credit-normal control accounts (ACCT-F5695) — comparing raw debit-positive closing_balance_cents " +
        "to a positive-magnitude subledger figure doubles the apparent variance for every Liability control role"
    );
  }
  if (!/normal_balance === "credit"[\s\S]{0,40}-raw|-raw[\s\S]{0,40}normal_balance === "credit"/.test(service)) {
    failures.push(
      "service defines normal_balance handling but does not actually flip sign for a credit-normal " +
        "account (ACCT-F5695) — a dead check leaves the sign bug live"
    );
  }
  // LV-ESCROW-CONTROL-ACCOUNT-BLIND-TO-CHILD-SUBACCOUNTS — a control account can be a grandparent
  // (e.g. USMCA's escrow hierarchy is 3 levels deep) with real postings only on a descendant leaf.
  // loadControlBalanceCents must roll up the FULL descendant subtree, not read one account_id.
  if (!/WITH RECURSIVE subtree/.test(service)) {
    failures.push(
      "service no longer rolls up the control account's descendant subtree (WITH RECURSIVE) — " +
        "a grandparent control account with postings only on a child/grandchild would read $0 again"
    );
  }
  if (!/a\.parent_account_id\s*=\s*s\.id/.test(service)) {
    failures.push(
      "service's subtree recursion no longer joins on catalogs.accounts.parent_account_id — " +
        "would stop recursing after the root and regress to the single-account blindness"
    );
  }

  if (!routes.includes('app.get("/api/v1/accounting/subledger-gl-control-rec"')) {
    failures.push("route must be GET /api/v1/accounting/subledger-gl-control-rec");
  }
  if (/app\.(post|put|patch|delete)\s*\(/i.test(routes)) {
    failures.push("routes must be GET-only (read surface)");
  }
  if (!/operating_company_id/.test(routes)) {
    failures.push("route must accept operating_company_id (entity-scoped TRANSP + USMCA)");
  }
  if (!/from\s+["'`][^"'`]*company-membership-guard\.js["'`]/.test(routes)) {
    failures.push(
      "route must import assertCompanyMembership from ../_helpers/company-membership-guard.js — " +
        "operating_company_id is caller-supplied and only UUID-validated; without this assert an " +
        "authed user can read another company's control-rec by passing its id"
    );
  }
  const assertIdx = routes.search(/assertCompanyMembership\s*\(/);
  const reportCallIdx = routes.search(/getSubledgerGlControlRecReport\s*\(/);
  if (assertIdx === -1) {
    failures.push("route must call assertCompanyMembership(user.uuid, operating_company_id) before the report read");
  } else if (reportCallIdx !== -1 && assertIdx > reportCallIdx) {
    failures.push("assertCompanyMembership must run BEFORE getSubledgerGlControlRecReport, not after");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

const failures = runStaticGuard();
if (failures.length) {
  console.error("verify-acct-dom-02-subledger-gl-control-rec — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

runSelftest();
console.log("[acct-dom-02-subledger-gl-control-rec] OK — READ-ONLY control rec wired for AR/AP/escrow/factoring");
