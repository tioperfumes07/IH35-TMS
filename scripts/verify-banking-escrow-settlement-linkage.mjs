#!/usr/bin/env node
/** Banking Full Audit FAIL 31 — Escrow ↔ settlement both-way linkage. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const routes = fs.readFileSync(`${root}/apps/backend/src/banking/escrow-visualizer.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const escrow = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx`,
    "utf8"
  );
  const settlement = fs.readFileSync(
    `${root}/apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx`,
    "utf8"
  );

  if (!routes.includes("settlement_id::text AS settlement_id")) {
    failures.push("escrow-visualizer timeline must SELECT settlement_id from escrow_ledger");
  }
  if (!api.includes("settlement_id?:") && !api.includes("settlement_id?: string")) {
    failures.push("EscrowDriverTimelineRow must expose settlement_id");
  }
  if (!escrow.includes('kind="settlement"') || !escrow.includes("banking-escrow-settlement-link")) {
    failures.push("DriverEscrowTabContent must EntityLink settlement when settlement_id present");
  }
  if (!settlement.includes('navigate("/banking/driver-escrow")') && !settlement.includes("navigate('/banking/driver-escrow')")) {
    failures.push("SettlementDetailPage onOpenEscrow must navigate to /banking/driver-escrow (not toast-only)");
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
    `settlement_id::text AS settlement_id\n`
  );
  mk("apps/frontend/src/api/banking.ts", `settlement_id?: string | null;\n`);
  mk(
    "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
    `kind="settlement"\nbanking-escrow-settlement-link\n`
  );
  mk(
    "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx",
    `navigate("/banking/driver-escrow")\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
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
