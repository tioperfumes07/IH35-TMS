#!/usr/bin/env node
/**
 * Banking Full Audit FAIL 31 — Escrow ↔ settlement both-way linkage.
 *
 * ACCT-SURF-09 (2026-07-29): SettlementDetail opens Accounting Escrow
 * (`/accounting/escrow?holder_id=`) as the canonical books surface. Banking
 * Driver Escrow (`/banking/driver-escrow`) remains reachable as a second hop
 * (Rule 07 never-delete) — typically via Accounting Escrow cross-link.
 *
 * ACCT-F5703 moved the timeline from the stale driver_finance.escrow_ledger
 * snapshot to accounting.escrow_postings, the canonical GL-linked subledger.
 * A settlement link is therefore present only when source_type identifies a
 * driver settlement; source_id is the canonical settlement FK in that case.
 *
 * @matrix-built {"modules":["banking"],"cols":["reverse_link"],"leafRe":"^driver_escrow$","task":"BANK-ESCROW-SETTLEMENT-LINKAGE","vertical":"column-wave"}
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const routes = fs.readFileSync(`${root}/apps/backend/src/banking/escrow-visualizer.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const escrow = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx`,
    "utf8"
  );
  const settlement = fs.readFileSync(
    `${root}/apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx`,
    "utf8"
  );
  const accountingEscrow = fs.existsSync(`${root}/apps/frontend/src/pages/accounting/EscrowPage.tsx`)
    ? fs.readFileSync(`${root}/apps/frontend/src/pages/accounting/EscrowPage.tsx`, "utf8")
    : "";
  const registerPageRel = "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx";
  const registerPage = fs.existsSync(`${root}/${registerPageRel}`)
    ? fs.readFileSync(`${root}/${registerPageRel}`, "utf8")
    : "";

  if (
    !/CASE\s+WHEN\s+ep\.source_type\s*=\s*'driver_settlement'\s+THEN\s+ep\.source_id::text\s+ELSE\s+NULL\s+END\s+AS\s+settlement_id/i.test(
      routes
    ) ||
    !/JOIN\s+accounting\.escrow_postings\s+ep/i.test(routes)
  ) {
    failures.push(
      "escrow-visualizer timeline must project driver-settlement source_id from canonical accounting.escrow_postings"
    );
  }
  if (!api.includes("settlement_id?:") && !api.includes("settlement_id?: string")) {
    failures.push("EscrowDriverTimelineRow must expose settlement_id");
  }
  if (!escrow.includes('kind="settlement"') || !escrow.includes("banking-escrow-settlement-link")) {
    failures.push("DriverEscrowTabContent must EntityLink settlement when settlement_id present");
  }

  const opensAccountingEscrow =
    settlement.includes("/accounting/escrow") &&
    (settlement.includes("onOpenEscrow") || settlement.includes("onOpenTimeline"));
  const opensBankingEscrow =
    settlement.includes('navigate("/banking/driver-escrow")') ||
    settlement.includes("navigate('/banking/driver-escrow')") ||
    settlement.includes("/banking/driver-escrow");
  if (!opensAccountingEscrow && !opensBankingEscrow) {
    failures.push(
      "SettlementDetailPage escrow open must navigate to /accounting/escrow (canonical) or /banking/driver-escrow (not toast-only)"
    );
  }

  // Rule 07: Banking Driver Escrow entry stays reachable (Settlement OR Accounting Escrow hop).
  const bankingEscrowReachable =
    opensBankingEscrow ||
    accountingEscrow.includes("/banking/driver-escrow") ||
    accountingEscrow.includes("escrow-banking-virtual-bank-link");
  if (!bankingEscrowReachable) {
    failures.push(
      "Banking /banking/driver-escrow must stay reachable from SettlementDetail or Accounting Escrow (never-delete)"
    );
  }

  // ROUND 443.250 Settlements EscrowRegister V3 — V3KpiTile strip (Driver / Held / Target /
  // Release) marked data-escrow-register-v3-kpis. Same getEscrowDriverBalances engine.
  if (!registerPage) {
    failures.push(`${registerPageRel}: must exist (ROUND 443.250 Settlements EscrowRegister V3)`);
  } else {
    if (!registerPage.includes("V3KpiTile")) {
      failures.push(`${registerPageRel}: must render V3KpiTile (ROUND 443.250 EscrowRegister V3)`);
    }
    if (!registerPage.includes("data-escrow-register-v3-kpis")) {
      failures.push(`${registerPageRel}: must mark data-escrow-register-v3-kpis for the V3 board strip`);
    }
    for (const label of ["Driver", "Held", "Target", "Release"]) {
      if (!new RegExp(`label=["']${label}["']`).test(registerPage)) {
        failures.push(`${registerPageRel}: V3 strip must include board label "${label}"`);
      }
    }
    if (!registerPage.includes("ESCROW_RELEASE_WINDOW_DAYS") || !registerPage.includes("60")) {
      failures.push(`${registerPageRel}: Release sub must use ESCROW_RELEASE_WINDOW_DAYS = 60 (board policy)`);
    }
    if (!registerPage.includes("getEscrowDriverBalances") || !registerPage.includes("getEscrowDriverTimeline")) {
      failures.push(`${registerPageRel}: must keep getEscrowDriverBalances + getEscrowDriverTimeline (engine unchanged)`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-escrow-settlement-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/banking/escrow-visualizer.routes.ts",
    `SELECT CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id\n` +
      `FROM accounting.escrow_accounts ea JOIN accounting.escrow_postings ep ON ep.escrow_account_id = ea.id\n`
  );
  mk("apps/frontend/src/api/banking.ts", `settlement_id?: string | null;\n`);
  mk(
    "apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx",
    `kind="settlement"\nbanking-escrow-settlement-link\n`
  );
  mk(
    "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx",
    `onOpenEscrow\nnavigate(\`/accounting/escrow?holder_id=\${driverId}\`)\n`
  );
  mk(
    "apps/frontend/src/pages/accounting/EscrowPage.tsx",
    `/banking/driver-escrow\nescrow-banking-virtual-bank-link\n`
  );
  mk(
    "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx",
    `import { V3KpiTile } from "../../components/v3/V3KpiTile";\n` +
      `const ESCROW_RELEASE_WINDOW_DAYS = 60;\n` +
      `data-escrow-register-v3-kpis="1"\n` +
      `<V3KpiTile label="Driver" value="x" />\n` +
      `<V3KpiTile label="Held" value="x" />\n` +
      `<V3KpiTile label="Target" value="—" />\n` +
      `<V3KpiTile label="Release" value="—" />\n` +
      `getEscrowDriverBalances\ngetEscrowDriverTimeline\n`,
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  mk(
    "apps/frontend/src/pages/banking/components/DriverEscrowLedgerSection.tsx",
    `kind="settlement"\nbanking-escrow-settlement-link\n`
  );
  mk(
    "apps/backend/src/banking/escrow-visualizer.routes.ts",
    `SELECT NULL::text AS settlement_id FROM accounting.escrow_accounts ea\n`
  );
  if (!run(tmp).length) throw new Error("settlement projection mutation escaped");
  // ROUND 443.250 — strip EscrowRegister V3 markers and expect FAIL.
  mk(
    "apps/backend/src/banking/escrow-visualizer.routes.ts",
    `SELECT CASE WHEN ep.source_type = 'driver_settlement' THEN ep.source_id::text ELSE NULL END AS settlement_id\n` +
      `FROM accounting.escrow_accounts ea JOIN accounting.escrow_postings ep ON ep.escrow_account_id = ea.id\n`,
  );
  mk(
    "apps/frontend/src/pages/driver-finance/EscrowRegisterPage.tsx",
    `getEscrowDriverBalances\ngetEscrowDriverTimeline\n`,
  );
  if (!run(tmp).length) throw new Error("EscrowRegister V3 strip mutation escaped");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-escrow-settlement-linkage --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-escrow-settlement-linkage — OK");
}
