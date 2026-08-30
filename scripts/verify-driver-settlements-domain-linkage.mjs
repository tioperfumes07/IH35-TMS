#!/usr/bin/env node
/**
 * verify-driver-settlements-domain-linkage — LAW OF THE LAND §9 (2026-07-22).
 *
 * Structural (regex) presence checks that the driver-settlements-domain reverse/forward drills
 * wired in this block stay wired: EntityLink cash_advance kind, driver-profile reverse links
 * (cash advances / escrow / auto-deductions), driver_id query-param plumbing on cash advances +
 * auto-deduction policies (FE + BE), and driver/settlement EntityLink usage on the cash-advance +
 * liability surfaces. Not a full TS-AST contract (see verify-entitylink-deep-links.mjs for that
 * style) — a lighter regex sweep, same style as verify-driver-picker-audit-present.mjs.
 *
 * Rule 17: lives entirely under scripts/ + scripts/verify-steps/ — no package.json /
 * locked-guards.yml / ci.yml edits.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const checks = [];

function read(relPath) {
  try {
    return readFileSync(resolve(ROOT, relPath), "utf8");
  } catch {
    return "";
  }
}

function requireMatch(relPath, pattern, description) {
  checks.push({ relPath, pattern, description });
}

// 1. EntityLink: cash_advance kind resolves to a real route (no dead link).
requireMatch(
  "apps/frontend/src/components/shared/EntityLink.tsx",
  /\|\s*"cash_advance"/,
  "EntityKind must include \"cash_advance\""
);
requireMatch(
  "apps/frontend/src/components/shared/EntityLink.tsx",
  /case "cash_advance":\s*\n\s*return `\/cash-advances\?advance_id=\$\{id\}`;/,
  "resolveEntityRoute must resolve cash_advance -> /cash-advances?advance_id="
);

// 2. Cash Advances Home: honors advance_id + driver_id deep-link/filter params (settlement/liability parity).
requireMatch(
  "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx",
  /searchParams\.get\("advance_id"\)/,
  "CashAdvancesHomePage must read advance_id from searchParams (EntityLink deep-link target)"
);
requireMatch(
  "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx",
  /searchParams\.get\("driver_id"\)/,
  "CashAdvancesHomePage must read driver_id from searchParams (driver-profile reverse link)"
);

// 3. Backend: cash-advances list endpoint accepts driver_id filter (read-path only, no new GL math).
requireMatch(
  "apps/backend/src/cash-advances/cash-advances.routes.ts",
  /driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/,
  "listQuerySchema must accept an optional driver_id filter"
);

// 4. Driver-facing EntityLink drill-throughs on the financial surfaces.
requireMatch(
  "apps/frontend/src/pages/cash-advances/components/CashAdvancesTable.tsx",
  /<EntityLink[\s\S]{0,60}kind="driver"/,
  "driver column must render <EntityLink kind=\"driver\" .../>"
);
requireMatch(
  "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx",
  /<EntityLink[\s\S]{0,60}kind="driver"/,
  "drawer must render the driver as <EntityLink kind=\"driver\" .../>"
);
requireMatch(
  "apps/frontend/src/pages/liabilities/components/LiabilitiesTable.tsx",
  /kind="driver"/,
  "driver column must render <EntityLink kind=\"driver\" .../>"
);
requireMatch(
  "apps/frontend/src/pages/liabilities/components/LiabilityDetailDrawer.tsx",
  /kind="driver"/,
  "drawer must render the driver as <EntityLink kind=\"driver\" .../>"
);

// 5. Settlement header: driver + loads-in-cycle are real drill-throughs, not "-" placeholders.
requireMatch(
  "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
  /kind="driver"/,
  "SettlementHeader must render the driver name as <EntityLink kind=\"driver\" .../>"
);
requireMatch(
  "apps/frontend/src/pages/driver-finance/components/SettlementHeader.tsx",
  /loadIds/,
  "SettlementHeader must accept + render a loadIds prop instead of a hardcoded \"-\""
);
requireMatch(
  "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
  /settlementLoadIds/,
  "SettlementDetailPage must compute distinct settlementLoadIds from settlement lines"
);

// 6. Driver profile (EarningsTab) reverse links: cash advances, escrow tile, auto-deduction policies.
requireMatch(
  "apps/frontend/src/components/drivers/EarningsTab.tsx",
  /driver-earnings-cash-advances-link/,
  "EarningsTab must link to /cash-advances?driver_id= (View all cash advances)"
);
requireMatch(
  "apps/frontend/src/components/drivers/EarningsTab.tsx",
  /driver-earnings-escrow-pre/,
  "EarningsTab must render an escrow tile (pre-clause balance, honest-empty)"
);
requireMatch(
  "apps/frontend/src/components/drivers/EarningsTab.tsx",
  /kind="driver_deductions_filter"[\s\S]{0,280}data-testid="driver-earnings-auto-deductions-link"/,
  "EarningsTab must EntityLink kind=driver_deductions_filter (Manage auto-deduction policies)"
);

// 7. Auto-deduction policies: driver_id scoping wired FE hook -> component -> panel (BE already supported it).
requireMatch(
  "apps/frontend/src/hooks/useAutoDeductionPolicies.ts",
  /export function useAutoDeductionPolicies\(operatingCompanyId: string, driverId\?: string\)/,
  "useAutoDeductionPolicies must accept an optional driverId filter"
);
requireMatch(
  "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
  /searchParams\.get\("driver_id"\)/,
  "AutoDeductionPoliciesPanel must read driver_id from searchParams (driver-profile reverse link)"
);

// 7b. FAIL-DD1 — policy card title must use projected driver_name, never bare EntityLink id (UUID title).
requireMatch(
  "apps/backend/src/settlements/auto-deductions/policy.routes.ts",
  /AS driver_name/,
  "policy list must project driver_name from mdata.drivers (FAIL-DD1)"
);
requireMatch(
  "apps/backend/src/settlements/auto-deductions/policy.routes.ts",
  /mdata\.resolve_driver_label_same_company\(\s*p\.driver_id\s*,\s*p\.operating_company_id\s*\)\s+AS\s+driver_name/,
  "policy list must resolve driver_name through the same-company historical-label resolver (FAIL-DD1)"
);
requireMatch(
  "apps/frontend/src/pages/drivers/AutoDeductionPolicies.tsx",
  /EntityLink kind="driver" id=\{row\.driver_id\} label=\{[^}]*row\.driver_name/,
  "AutoDeductionPolicies card title must pass driver_name as EntityLink label (FAIL-DD1)"
);

// 8. DriverDetail: operations sub-view deep link + EarningsTab callback wiring (forward+reverse).
requireMatch(
  "apps/frontend/src/pages/DriverDetail.tsx",
  /onOpenOperationsView/,
  "DriverDetailPage must pass onOpenOperationsView to EarningsTab (Escrow tile -> Operations tab drill)"
);

// 9. LV-SETTLEMENT-LOAD-FK (F-06): the settlement DETAIL lines must carry the load NUMBER, not just
//    the load id — and the join that resolves it must be entity-scoped.
//
//    THE DEFECT, exactly as it shipped: the detail read was `SELECT * FROM
//    driver_finance.settlement_lines`, which returns load_id and nothing a human can read, because
//    load_number lives on mdata.loads. Meanwhile SettlementDetailPage.tsx ALREADY read
//    `line.load_number` and already handled the null case — its own comment says "The line already has
//    it (`line.load_number`)". It did not. The frontend had been built for a payload the API never
//    sent, so the field was permanently undefined and the Load column had only a uuid to show. A
//    half-wired chain like this passes every FE test (the component is correct) and every backend test
//    (the query is valid) while being broken end to end, which is why the assertion belongs here.
//
//    PROD-VERIFIED 2026-08-11 (USMCA, control healthy at 4 lines / 8 settlements): the link is real —
//    S-20260808-0085 -> L-20260808-0085, S-20260808-0090 -> L-20260808-0090 — while S-2026-0001's two
//    lines carry no load_id at all, so a NULL load_number there is correct and must stay honest.
requireMatch(
  "apps/backend/src/driver-finance/settlements.routes.ts",
  /LEFT JOIN mdata\.loads l[\s\S]{0,200}?l\.operating_company_id\s*=\s*\$2::uuid/,
  "settlement detail lines must LEFT JOIN mdata.loads scoped by operating_company_id (a load from another entity must never resolve into this payload)"
);
requireMatch(
  "apps/backend/src/driver-finance/settlements.routes.ts",
  /SELECT\s+sl\.\*,\s*l\.load_number/,
  "settlement detail lines must project l.load_number — SettlementDetailPage reads line.load_number and renders a raw uuid without it (LV-SETTLEMENT-LOAD-FK)"
);

function audit(overrides = {}) {
  const failures = [];
  for (const { relPath, pattern, description } of checks) {
    const content = overrides[relPath] ?? read(relPath);
    if (!content) failures.push(`MISSING FILE: ${relPath}`);
    else if (!pattern.test(content)) failures.push(`${relPath}: ${description}`);
  }
  return failures;
}

const failures = audit();
if (failures.length > 0) {
  console.error("FAIL verify-driver-settlements-domain-linkage:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  const live = Object.fromEntries([...new Set(checks.map(({ relPath }) => relPath))].map((relPath) => [relPath, read(relPath)]));
  for (const { relPath, pattern, description } of checks) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const planted = live[relPath].replace(new RegExp(pattern.source, flags), "/* planted SETL-F5819 defect */");
    const expected = `${relPath}: ${description}`;
    if (planted === live[relPath] || !audit({ ...live, [relPath]: planted }).includes(expected)) {
      console.error(`FAIL verify-driver-settlements-domain-linkage selftest: plant escaped — ${description}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-driver-settlements-domain-linkage selftest — ${checks.length}/${checks.length} production defects rejected`);
  process.exit(0);
}
console.log("PASS verify-driver-settlements-domain-linkage");
