#!/usr/bin/env node
/**
 * ACCT-SURF-09 — Factoring / Escrow / Settlements cross-link deep structural DoD.
 *
 * Frozen surface map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/factoring → FactoringListPage; /accounting/escrow → EscrowPage;
 *    /driver-finance/settlements → SettlementsPage; More ▾ leaves; no ComingSoon twin
 *  - NEVER-DELETE §F.24: factoring/escrow/settlements entry points + redirect aliases stay mounted
 *  - DOD-C / VERIFY-4: EntityLink drill-through + cross-module nav (Escrow↔Settlements↔Factoring)
 *  - VERIFY-3: canonical server writes (accounting.factoring_advances, accounting.escrow_*,
 *    driver_finance.driver_settlements — never RETIRE schemas)
 *
 * Does NOT flip scoreboard PASS — live browser cross-link economics + Neon density remain UNVERIFIED.
 * LINK-02 detail_types FK wiring is FROZEN owner decision — out of scope.
 *
 *   node scripts/verify-acct-surf-09-crosslinks.mjs
 *   node scripts/verify-acct-surf-09-crosslinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-09-crosslinks";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
  factoringList: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
  escrowPage: "apps/frontend/src/pages/accounting/EscrowPage.tsx",
  settlementsPage: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  hubPage: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
  accountRegister: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
  factoringApi: "apps/frontend/src/api/accounting.ts",
  settlementsApi: "apps/frontend/src/api/driverFinance.ts",
  factoringRoutes: "apps/backend/src/accounting/factoring-advances.routes.ts",
  escrowService: "apps/backend/src/accounting/escrow/service.ts",
  settlementsRoutes: "apps/backend/src/driver-finance/settlements.routes.ts",
  txnRegister: "apps/backend/src/accounting/transaction-register.routes.ts",
};

const CROSS_LINK_LEAVES = [
  "/accounting/factoring",
  "/accounting/escrow",
  "/driver-finance/settlements",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  if (!src.map.includes("ACCT-SURF-09") || !src.map.includes("/accounting/factoring")) {
    errors.push("frozen map missing ACCT-SURF-09 → /accounting/factoring");
  }
  if (!src.map.includes("/accounting/escrow") || !src.map.includes("/driver-finance/settlements")) {
    errors.push("frozen map missing ACCT-SURF-09 escrow/settlements routes");
  }

  const routes = [
    { path: "/accounting/factoring", component: "FactoringListPage", label: "Factoring" },
    { path: "/accounting/escrow", component: "EscrowPage", label: "Escrow" },
    { path: "/driver-finance/settlements", component: "SettlementsPage", label: "Settlements" },
  ];

  for (const r of routes) {
    const block = routeBlock(src.manifest, r.path);
    if (!block) {
      errors.push(`DOD-A: missing route ${r.path}`);
      continue;
    }
    if (/ComingSoonPage/.test(block)) {
      errors.push(`DOD-A: ${r.path} must not mount ComingSoonPage twin`);
    }
    if (!block.includes(`<${r.component}`)) {
      errors.push(`DOD-A: ${r.path} must render <${r.component} />`);
    }
  }

  for (const leaf of CROSS_LINK_LEAVES) {
    if (!src.subnav.includes(leaf)) {
      errors.push(`DOD-A / NEVER-DELETE: More ▾ leaf ${leaf} missing from subnav-manifest`);
    }
  }

  // Redirect aliases — never delete legacy entry points (Rule 07).
  if (
    !src.manifest.includes('path="/accounting/settlements"') ||
    !src.manifest.includes('to="/driver-finance/settlements"')
  ) {
    errors.push("NEVER-DELETE: /accounting/settlements alias must redirect to /driver-finance/settlements");
  }
  if (
    !src.manifest.includes('path="/settlements"') ||
    !src.manifest.match(/path="\/settlements"[\s\S]{0,200}to="\/driver-finance\/settlements"/)
  ) {
    errors.push("NEVER-DELETE: /settlements alias must redirect to /driver-finance/settlements");
  }

  // EntityLink resolver — forward drill-through for cross-module kinds.
  if (!src.entityLink.includes('case "factoring_advance"') || !src.entityLink.includes("/accounting/factoring/")) {
    errors.push("VERIFY-4: EntityLink factoring_advance must resolve to /accounting/factoring/:id");
  }
  if (
    !src.entityLink.includes('case "settlement"') ||
    !src.entityLink.includes("/driver-finance/settlements?settlement_id=")
  ) {
    errors.push("VERIFY-4: EntityLink settlement must resolve to /driver-finance/settlements?settlement_id=");
  }

  // Escrow postings reverse-link to settlement + factoring sources.
  if (!src.escrowPage.includes("EntityLink")) {
    errors.push("VERIFY-4: EscrowPage must render EntityLink for cross-module drill-through");
  }
  if (!src.escrowPage.includes('"driver_settlement"') || !src.escrowPage.includes('"factoring_advance"')) {
    errors.push("VERIFY-4: EscrowPage must map driver_settlement + factoring_advance source types");
  }
  if (!src.escrowPage.includes('kind="settlement"') && !src.escrowPage.includes("kind={kind}")) {
    errors.push("VERIFY-4: EscrowPage must link settlement sources via EntityLink");
  }

  if (!src.factoringList.includes('kind="factoring_advance"')) {
    errors.push("VERIFY-4: FactoringListPage must EntityLink factoring_advance rows");
  }
  if (!src.factoringList.includes("AccountingSubNavWrapper")) {
    errors.push("DOD-A: FactoringListPage must stay under Accounting subnav chrome");
  }

  if (!src.settlementsPage.includes("/accounting/escrow")) {
    errors.push("VERIFY-4: SettlementsPage subnav must cross-link to /accounting/escrow");
  }
  if (!src.settlementsPage.includes("listSettlements")) {
    errors.push("VERIFY-3: SettlementsPage must load via listSettlements API");
  }
  // FAIL-SETL-KPI-PERIOD — This Period / YTD must not both equal settlements.length (list-length theater).
  if (/this_period:\s*settlements\.length/.test(src.settlementsPage) || /ytd_settlements:\s*settlements\.length/.test(src.settlementsPage)) {
    errors.push("VERIFY-1: SettlementsPage This Period / YTD KPIs must not equal raw settlements.length");
  }
  if (!src.settlementsPage.includes("getFullYear") && !src.settlementsPage.includes("ytdYear")) {
    errors.push("VERIFY-1: SettlementsPage YTD KPI must filter by calendar year (period_end)");
  }

  if (!src.hubPage.includes("/accounting/factoring") || !src.hubPage.includes("/driver-finance/settlements")) {
    errors.push("VERIFY-4: AccountingHubPage must cross-link factoring + settlements from Accounting home");
  }

  if (!src.accountRegister.includes("/driver-finance/settlements")) {
    errors.push("VERIFY-4: AccountRegisterPage must drill settlements to /driver-finance/settlements");
  }

  // Frontend API wiring.
  if (!src.factoringApi.includes("listFactoringAdvances") || !src.factoringApi.includes("/api/v1/accounting/factoring-advances")) {
    errors.push("VERIFY-3: listFactoringAdvances must GET /api/v1/accounting/factoring-advances");
  }
  if (!src.factoringApi.includes("listEscrowAccounts") || !src.factoringApi.includes("/api/v1/accounting/escrow/accounts")) {
    errors.push("VERIFY-3: listEscrowAccounts must GET /api/v1/accounting/escrow/accounts");
  }
  if (!src.settlementsApi.includes("listSettlements") || !src.settlementsApi.includes("/api/v1/driver-finance/settlements")) {
    errors.push("VERIFY-3: listSettlements must GET /api/v1/driver-finance/settlements");
  }

  // Backend canonical tables — never RETIRE schemas.
  if (!src.factoringRoutes.includes("INSERT INTO accounting.factoring_advances")) {
    errors.push("VERIFY-3: factoring create must INSERT INTO accounting.factoring_advances (canonical)");
  }
  if (/INSERT INTO\s+mdata\.qbo_|INSERT INTO\s+bank\./i.test(src.factoringRoutes)) {
    errors.push("VERIFY-3: factoring routes must not write RETIRE schemas");
  }

  if (!src.escrowService.includes("INSERT INTO accounting.escrow_accounts")) {
    errors.push("VERIFY-3: escrow service must INSERT INTO accounting.escrow_accounts (canonical)");
  }
  if (!src.escrowService.includes("INSERT INTO accounting.escrow_postings")) {
    errors.push("VERIFY-3: escrow service must INSERT INTO accounting.escrow_postings (canonical)");
  }

  if (!src.settlementsRoutes.includes("INSERT INTO driver_finance.driver_settlements")) {
    errors.push("VERIFY-3: settlements create must INSERT INTO driver_finance.driver_settlements (canonical)");
  }
  if (/INSERT INTO\s+payroll\.|INSERT INTO\s+settlement\./i.test(src.settlementsRoutes)) {
    errors.push("VERIFY-3: settlements routes must not write RETIRE payroll/settlement schemas");
  }

  if (
    !src.txnRegister.includes("driver_finance.driver_settlements") ||
    !src.txnRegister.includes("/driver-finance/settlements")
  ) {
    errors.push("VERIFY-4: transaction register must UNION settlements with /driver-finance/settlements detail_path");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-09 /accounting/factoring /accounting/escrow /driver-finance/settlements",
    manifest: [
      'path="/accounting/factoring"\n<FactoringListPage />\n',
      'path="/accounting/escrow"\n<EscrowPage />\n',
      'path="/driver-finance/settlements"\n<SettlementsPage />\n',
      'path="/accounting/settlements" element={<PreserveSearchNavigate to="/driver-finance/settlements" />}',
      'path="/settlements" element={<PreserveSearchNavigate to="/driver-finance/settlements" />}',
    ].join("\n"),
    subnav: CROSS_LINK_LEAVES.join("\n"),
    entityLink: [
      'case "factoring_advance": return `/accounting/factoring/${id}`;',
      'case "settlement": return `/driver-finance/settlements?settlement_id=${id}`;',
    ].join("\n"),
    factoringList: 'EntityLink kind="factoring_advance"\nAccountingSubNavWrapper',
    escrowPage: 'EntityLink kind={kind}\n"driver_settlement"\n"factoring_advance"',
    settlementsPage: 'to: "/accounting/escrow"\nlistSettlements\nytdYear\ngetFullYear\nthis_period: settlements.filter(isInThisPeriod).length\nytd_settlements: settlements.filter(isYtd).length',
    hubPage: '/accounting/factoring\n/driver-finance/settlements',
    accountRegister: "/driver-finance/settlements",
    factoringApi: "listFactoringAdvances /api/v1/accounting/factoring-advances\nlistEscrowAccounts /api/v1/accounting/escrow/accounts",
    settlementsApi: "listSettlements /api/v1/driver-finance/settlements",
    factoringRoutes: "INSERT INTO accounting.factoring_advances",
    escrowService: "INSERT INTO accounting.escrow_accounts\nINSERT INTO accounting.escrow_postings",
    settlementsRoutes: "INSERT INTO driver_finance.driver_settlements",
    txnRegister: "driver_finance.driver_settlements\n/driver-finance/settlements",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = { ...good, manifest: good.manifest.replace("FactoringListPage", "ComingSoonPage") };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const noSubnav = { ...good, subnav: "" };
  if (!contractErrors(noSubnav).some((e) => e.includes("NEVER-DELETE") || e.includes("subnav"))) {
    console.error(`${LABEL} --selftest FAIL subnav drop not caught`);
    process.exit(1);
  }
  const kpiTheater = {
    ...good,
    settlementsPage:
      'to: "/accounting/escrow"\nlistSettlements\nthis_period: settlements.length\nytd_settlements: settlements.length',
  };
  if (!contractErrors(kpiTheater).some((e) => e.includes("This Period") || e.includes("YTD"))) {
    console.error(`${LABEL} --selftest FAIL KPI period theater not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ACCT-SURF-09 cross-link structural DoD (routes+More▾+EntityLink+canonical tables); live browser economics still UNVERIFIED`
);
process.exit(0);
