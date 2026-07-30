#!/usr/bin/env node
/**
 * BANK-F10 / BANK-ECON-05 + BANK-GATE-01 — active-only cash-bind keep-guard.
 *
 * Protects the corrected 7/7 metric: count ONLY live rows (deactivated_at IS NULL).
 * Nine deactivated rows stay (archive-never-delete) and must NOT inflate bound/unbound
 * (prior stale audit reported "8/16" by counting deactivated duplicates).
 *
 * Static pins:
 * - Cash GL GET/PUT routes filter deactivated_at IS NULL (active-only bind surface)
 * - banking.json BANK-ECON-05 + BANK-GATE-01 + BANK-CTRL-01 remain PASS
 * - pass_count matches PASS items (MODULE_PROGRESS honesty — 4 of 14)
 * - verify-step 1430 money-theater gate stays wired
 *
 * --selftest: missing bind UPDATE, 8/16 evidence, missing active filter, dishonest pass_count.
 *
 * Self-test: node scripts/verify-bank-account-cashbind.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreManifest } from "./verify-module-completion.mjs";

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

  // Bind path writes banking.bank_accounts.ledger_account_id (active rows only)
  if (!/UPDATE\s+banking\.bank_accounts\s+SET\s+ledger_account_id/i.test(routes)) {
    failures.push("banking.routes must UPDATE banking.bank_accounts SET ledger_account_id (Cash bind)");
  }
  if (!routes.includes("ledger_account_id")) {
    failures.push("banking.routes Cash GL setup must select/update ledger_account_id");
  }
  const cashGlSection = routes.slice(routes.indexOf("/cash-gl-mapping"), routes.indexOf("/cash-gl", routes.indexOf("/cash-gl-mapping") + 1) + 2000);
  if (!cashGlSection.includes("deactivated_at IS NULL")) {
    failures.push("cash-gl-mapping route must filter deactivated_at IS NULL (active-only — never count deactivated in bind gap)");
  }
  if (!/accounts\/:id\/cash-gl[\s\S]{0,1200}deactivated_at IS NULL/i.test(routes)) {
    failures.push("PUT /accounts/:id/cash-gl bind route must scope to deactivated_at IS NULL active accounts");
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
  const ctrl01 = (parsed.items || []).find((i) => i.id === "BANK-CTRL-01");
  if (!econ05 || econ05.status !== "PASS") {
    failures.push("BANK-ECON-05 must remain PASS in banking.json (7/7 live cashbind)");
  }
  // Allow historical "Prior 8/16" wording; forbid claiming current bound metric as 8/16.
  const econEv = String(econ05?.evidence || "");
  if (/\b8\s*\/\s*16\b/.test(econEv) && !/prior\s+8\s*\/\s*16/i.test(econEv) && !/7\s*\/\s*7/.test(econEv)) {
    failures.push("BANK-ECON-05 evidence must not use the stale 8/16 deactivated over-count as current");
  }
  if (!/7\s*\/\s*7|deactivated_at IS NULL|deactivated.*excluded/i.test(econEv)) {
    failures.push("BANK-ECON-05 evidence must document active-only 7/7 + deactivated exclusion");
  }
  if (!/verify-bank-account-cashbind|1442/.test(econEv)) {
    failures.push("BANK-ECON-05 evidence must cite verify-bank-account-cashbind keep-guard (step 1442)");
  }
  if (!gate01 || gate01.status !== "PASS") {
    failures.push("BANK-GATE-01 must remain PASS (verify-step 1430)");
  }
  if (gate01 && !String(gate01.evidence || "").includes("1430")) {
    failures.push("BANK-GATE-01 evidence must cite verify-step 1430");
  }
  if (!ctrl01 || ctrl01.status !== "PASS") {
    failures.push("BANK-CTRL-01 must remain PASS (flags OFF by design)");
  }
  if (ctrl01 && !/flag.*OFF|Flags OFF/i.test(String(ctrl01.evidence || ""))) {
    failures.push("BANK-CTRL-01 evidence must document flags OFF");
  }

  // BANK-GATE-01: MODULE_PROGRESS honesty — pass_count matches PASS-only tally; complete stays false while FAILs open
  const passOnly = (parsed.items || []).filter((i) => i.status === "PASS").length;
  if (typeof parsed.pass_count === "number" && parsed.pass_count !== passOnly) {
    failures.push(`banking.json pass_count (${parsed.pass_count}) must equal PASS item count (${passOnly}) — dishonest MODULE_PROGRESS`);
  }
  const { N, M } = scoreManifest(parsed);
  // Rule 21: M grows when new FAIL leaves appear (BANK-F08/F09). Floor is 13 — never shrink below.
  if (M < 13) {
    failures.push(`banking manifest must have ≥13 items (got ${M}) — do not shrink M to fake progress`);
  }
  if (parsed.complete === true) {
    const open = (parsed.items || []).filter(
      (i) =>
        i.status === "FAIL" ||
        i.status === "UNVERIFIED" ||
        (i.status === "HOLD" && !(i.owner_hold && i.tracker && i.future_block))
    );
    if (open.length) {
      failures.push(
        `banking complete:true is ILLEGAL while open items remain: ${open.map((i) => i.id).join(", ")}`
      );
    }
  }
  // Ratchet: PASS count may grow as live density closes; never shrink below historic floor of 4.
  if (passOnly < 4) {
    failures.push(`banking PASS items must stay ≥4 (got ${passOnly}) — do not regress MODULE_PROGRESS`);
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
    `UPDATE banking.bank_accounts SET ledger_account_id = $1\nledger_account_id\n/cash-gl-mapping\ndeactivated_at IS NULL\n/accounts/:id/cash-gl\ndeactivated_at IS NULL\n`
  );
  mk(FILES.cashGlPage, `setBankAccountCashGl\nReferenceSelect\n`);
  mk(FILES.home, `/banking/cash-gl-setup\n`);
  mk(FILES.unboundHonesty, `unboundCount\nbanking-cash-gl-unbound-honesty-banner\n`);
  mk(FILES.gateStep, `verify-no-money-theater\n`);
  mk(FILES.gateScript, `MODULE_PROGRESS\nFINDING\n`);
  mk(
    FILES.bankingJson,
    JSON.stringify({
      module: "banking",
      complete: false,
      pass_count: 4,
      items: [
        { id: "BANK-ECON-01", status: "PASS", evidence: "feed" },
        {
          id: "BANK-ECON-05",
          status: "PASS",
          evidence: "Neon lucia 7/7 live (deactivated_at IS NULL); 9 deactivated excluded. verify-bank-account-cashbind step 1442 keep-guard.",
        },
        { id: "BANK-CTRL-01", status: "PASS", evidence: "Flags OFF by design" },
        {
          id: "BANK-GATE-01",
          status: "PASS",
          evidence: "verify-step 1430 enforces checklist",
        },
        { id: "BANK-ECON-02", status: "FAIL", evidence: "density" },
        { id: "BANK-ECON-03", status: "FAIL", evidence: "transfers" },
        { id: "BANK-ECON-04", status: "HOLD", owner_hold: true, tracker: "t", future_block: "b", evidence: "rls" },
        { id: "BANK-SURF-01", status: "UNVERIFIED", evidence: "structural" },
        { id: "BANK-SURF-02", status: "FAIL", evidence: "density" },
        { id: "BANK-SURF-03", status: "FAIL", evidence: "transfers" },
        { id: "BANK-SURF-04", status: "HOLD", owner_hold: true, tracker: "t", future_block: "b", evidence: "rls" },
        { id: "BANK-SURF-05", status: "UNVERIFIED", evidence: "structural" },
        { id: "BANK-SURF-06", status: "UNVERIFIED", evidence: "structural" },
        { id: "BANK-LINK-01", status: "UNVERIFIED", evidence: "sparse" },
      ],
    })
  );
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));

  // unbound active (missing UPDATE) must FAIL
  mk(FILES.routes, `SELECT ledger_account_id FROM banking.bank_accounts\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when bind UPDATE missing");

  mk(
    FILES.routes,
    `UPDATE banking.bank_accounts SET ledger_account_id = $1\nledger_account_id\n/cash-gl-mapping\ndeactivated_at IS NULL\n/accounts/:id/cash-gl\ndeactivated_at IS NULL\n`
  );
  // deactivated inflation framing
  mk(
    FILES.bankingJson,
    JSON.stringify({
      module: "banking",
      complete: false,
      pass_count: 4,
      items: [
        { id: "BANK-ECON-01", status: "PASS", evidence: "feed" },
        { id: "BANK-ECON-05", status: "PASS", evidence: "currently 8/16 bound (stale deactivated over-count)" },
        { id: "BANK-CTRL-01", status: "PASS", evidence: "Flags OFF" },
        { id: "BANK-GATE-01", status: "PASS", evidence: "verify-step 1430" },
        { id: "BANK-ECON-02", status: "FAIL", evidence: "x" },
        { id: "BANK-ECON-03", status: "FAIL", evidence: "x" },
        { id: "BANK-ECON-04", status: "HOLD", owner_hold: true, tracker: "t", future_block: "b", evidence: "x" },
        { id: "BANK-SURF-01", status: "UNVERIFIED", evidence: "x" },
        { id: "BANK-SURF-02", status: "FAIL", evidence: "x" },
        { id: "BANK-SURF-03", status: "FAIL", evidence: "x" },
        { id: "BANK-SURF-04", status: "HOLD", owner_hold: true, tracker: "t", future_block: "b", evidence: "x" },
        { id: "BANK-SURF-05", status: "UNVERIFIED", evidence: "x" },
        { id: "BANK-LINK-01", status: "UNVERIFIED", evidence: "x" },
      ],
    })
  );
  if (!run(tmp).length) throw new Error("expected FAIL on 8/16 over-count evidence");

  // missing active-only filter on cash-gl routes
  mk(
    FILES.routes,
    `UPDATE banking.bank_accounts SET ledger_account_id = $1\n/cash-gl-mapping\nSELECT 1\n/cash-gl\n`
  );
  if (!run(tmp).length) throw new Error("expected FAIL when deactivated_at IS NULL filter missing");

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
