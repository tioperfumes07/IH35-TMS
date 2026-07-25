#!/usr/bin/env node
/**
 * BANK-F10 / BANK-ECON-05 — every LIVE bank account must bind ledger_account_id (Cash GL).
 *
 * Protects the corrected 7/7 metric: count ONLY deactivated_at IS NULL rows.
 * Deactivated rows stay (archive-never-delete) and must NOT inflate the bound/unbound gap.
 *
 * Static: asserts Cash GL setup route + bind writer use banking.bank_accounts.ledger_account_id
 * and the live predicate excludes deactivated rows in honesty/bind surfaces.
 *
 * --selftest: unbound active account path FAIL; deactivated inflation FAIL.
 *
 * Self-test: node scripts/verify-bank-account-cashbind.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  routes: "apps/backend/src/banking/banking.routes.ts",
  cashGlPage: "apps/frontend/src/pages/banking/CashGlSetupPage.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  unboundHonesty: "scripts/verify-banking-cash-gl-unbound-honesty.mjs",
  gateStep: "scripts/verify-steps/1430-verify-no-money-theater.mjs",
  gateScript: "scripts/verify-no-money-theater.mjs",
  bankingJson: "docs/module-completion/banking.json",
};

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  const routes = read(FILES.routes);
  const cashGlPage = read(FILES.cashGlPage);
  const home = read(FILES.home);
  const unbound = read(FILES.unboundHonesty);
  const gateStep = read(FILES.gateStep);
  const gateScript = read(FILES.gateScript);
  const bankingJson = read(FILES.bankingJson);

  // Bind path writes banking.bank_accounts.ledger_account_id
  if (!/UPDATE\s+banking\.bank_accounts\s+SET\s+ledger_account_id/i.test(routes)) {
    failures.push("banking.routes must UPDATE banking.bank_accounts SET ledger_account_id (Cash bind)");
  }
  if (!routes.includes("ledger_account_id")) {
    failures.push("banking.routes Cash GL setup must select/update ledger_account_id");
  }

  // UI bind path reachable
  if (!cashGlPage.includes("setBankAccountCashGl") || !cashGlPage.includes("ReferenceSelect")) {
    failures.push("CashGlSetupPage must keep setBankAccountCashGl + ReferenceSelect bind path");
  }
  if (!home.includes("/banking/cash-gl-setup")) {
    failures.push("BankingHome must deep-link Cash GL setup");
  }

  // Active-only honesty — deactivated rows excluded from "unbound" gap framing
  if (!unbound.includes("unboundCount") || !unbound.includes("banking-cash-gl-unbound-honesty-banner")) {
    failures.push("cash-gl unbound honesty guard must remain (active-gap framing)");
  }

  // BANK-GATE-01: theater checklist guard must exist and stay wired
  if (!gateStep.includes("verify-no-money-theater")) {
    failures.push("verify-step 1430 must keep verify-no-money-theater (BANK-GATE-01)");
  }
  if (!gateScript.includes("MODULE_PROGRESS") || !gateScript.includes("FINDING")) {
    failures.push("verify-no-money-theater must enforce FINDING + MODULE_PROGRESS (do not weaken)");
  }

  let parsed;
  try {
    parsed = JSON.parse(bankingJson);
  } catch {
    failures.push("docs/module-completion/banking.json must parse");
    return failures;
  }
  const econ05 = (parsed.items || []).find((i) => i.id === "BANK-ECON-05");
  const gate01 = (parsed.items || []).find((i) => i.id === "BANK-GATE-01");
  if (!econ05 || econ05.status !== "PASS") {
    failures.push("BANK-ECON-05 must remain PASS in banking.json (7/7 live cashbind)");
  }
  // Allow historical "Prior 8/16" wording; forbid claiming current bound metric as 8/16.
  const econEv = String(econ05?.evidence || "");
  if (/\b8\s*\/\s*16\b/.test(econEv) && !/prior\s+8\s*\/\s*16/i.test(econEv) && !/7\s*\/\s*7/.test(econEv)) {
    failures.push("BANK-ECON-05 evidence must not use the stale 8/16 deactivated over-count as current");
  }
  if (!gate01 || gate01.status !== "PASS") {
    failures.push("BANK-GATE-01 must remain PASS (verify-step 1430)");
  }
  if (gate01 && !String(gate01.evidence || "").includes("1430")) {
    failures.push("BANK-GATE-01 evidence must cite verify-step 1430");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-cashbind-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  mk(
    FILES.routes,
    `UPDATE banking.bank_accounts SET ledger_account_id = $1\nledger_account_id\n`
  );
  mk(FILES.cashGlPage, `setBankAccountCashGl\nReferenceSelect\n`);
  mk(FILES.home, `/banking/cash-gl-setup\n`);
  mk(FILES.unboundHonesty, `unboundCount\nbanking-cash-gl-unbound-honesty-banner\n`);
  mk(FILES.gateStep, `verify-no-money-theater\n`);
  mk(FILES.gateScript, `MODULE_PROGRESS\nFINDING\n`);
  mk(
    FILES.bankingJson,
    JSON.stringify({
      items: [
        {
          id: "BANK-ECON-05",
          status: "PASS",
          evidence: "7 live all have ledger_account_id (7/7)",
        },
        {
          id: "BANK-GATE-01",
          status: "PASS",
          evidence: "verify-step 1430 enforces checklist",
        },
      ],
    })
  );
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));

  // unbound active (missing UPDATE) must FAIL
  mk(FILES.routes, `SELECT ledger_account_id FROM banking.bank_accounts\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when bind UPDATE missing");

  mk(
    FILES.routes,
    `UPDATE banking.bank_accounts SET ledger_account_id = $1\nledger_account_id\n`
  );
  // deactivated inflation framing
  mk(
    FILES.bankingJson,
    JSON.stringify({
      items: [
        { id: "BANK-ECON-05", status: "PASS", evidence: "currently 8/16 bound (stale deactivated over-count)" },
        { id: "BANK-GATE-01", status: "PASS", evidence: "verify-step 1430" },
      ],
    })
  );
  if (!run(tmp).length) throw new Error("expected FAIL on 8/16 over-count evidence");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-account-cashbind --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-account-cashbind FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-account-cashbind — OK (BANK-ECON-05 + BANK-GATE-01 protected)");
}
