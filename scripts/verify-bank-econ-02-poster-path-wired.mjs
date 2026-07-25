#!/usr/bin/env node
/**
 * BANK-ECON-02 / BANK-SURF-02 — honesty + keep-guards.
 *
 * Poster path (#3424 merged on main) must stay wired; manifest must stay FAIL with
 * honest ops-backlog framing — never invent density PASS while matched_je ≈ 3/10628.
 *
 * Pins: verify-banking-bulk-categorize-posts-je + verify-bank-feed-gl-posting + banking.json honesty.
 *
 * Self-test: node scripts/verify-bank-econ-02-poster-path-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run as bulkPosterRun } from "./verify-banking-bulk-categorize-posts-je.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  bankingJson: "docs/module-completion/banking.json",
  designView: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  bankingApi: "apps/frontend/src/api/banking.ts",
  glPosting: "scripts/verify-bank-feed-gl-posting.mjs",
  bulkJe: "scripts/verify-banking-bulk-categorize-posts-je.mjs",
  step1480: "scripts/verify-steps/1480-verify-bank-econ-02-poster-path-wired.mjs",
};

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  // 1. Existing poster wiring guards must pass (no regression of #3424 path).
  const bulkFails = bulkPosterRun(root);
  if (bulkFails.length) {
    failures.push(`bulk categorize poster wiring: ${bulkFails.join("; ")}`);
  }

  // 2. CHAIN-05 bank-feed GL posting guard file must exist (static pin).
  for (const rel of [FILES.glPosting, FILES.bulkJe, FILES.step1480]) {
    if (!fs.existsSync(path.join(root, rel))) {
      failures.push(`missing ${rel}`);
    }
  }

  // 3. UI must call real categorize-bulk route (not toast theater).
  const designView = read(FILES.designView);
  const bankingApi = read(FILES.bankingApi);
  if (!designView.includes("categorize-bulk") && !designView.includes("categorizeTransactionsBulk")) {
    failures.push("BankingTransactionsDesignView must wire bulk categorize (categorize-bulk / categorizeTransactionsBulk)");
  }
  if (!bankingApi.includes("/api/v1/banking/transactions/categorize-bulk")) {
    failures.push("banking.ts must call POST /api/v1/banking/transactions/categorize-bulk");
  }

  // 4. banking.json honesty — FAIL + ops backlog, never fake density PASS.
  let parsed;
  try {
    parsed = JSON.parse(read(FILES.bankingJson));
  } catch {
    failures.push("docs/module-completion/banking.json must parse");
    return failures;
  }
  const items = parsed.items || [];
  const econ02 = items.find((i) => i.id === "BANK-ECON-02");
  const surf02 = items.find((i) => i.id === "BANK-SURF-02");

  if (!econ02) {
    failures.push("banking.json must include BANK-ECON-02");
  } else {
    if (econ02.status === "PASS") {
      failures.push("BANK-ECON-02 must remain FAIL — do not invent density PASS (matched_je ≈ 3/10628 is ops backlog)");
    }
    const ev = String(econ02.evidence || "");
    if (!/ops backlog|not a broken poster|matched_je/i.test(ev)) {
      failures.push("BANK-ECON-02 evidence must frame density as ops backlog / poster works when used");
    }
    if (!/#3424/.test(ev + String(econ02.pr || ""))) {
      failures.push("BANK-ECON-02 must cite #3424 (poster merged on main)");
    }
    if (!/1480|verify-bank-econ-02-poster-path-wired/i.test(ev)) {
      failures.push("BANK-ECON-02 evidence must cite verify-step 1480 guard");
    }
  }

  if (!surf02) {
    failures.push("banking.json must include BANK-SURF-02");
  } else if (surf02.status === "PASS") {
    failures.push("BANK-SURF-02 must remain FAIL while BANK-ECON-02 density is ops backlog");
  }

  if (parsed.complete === true) {
    failures.push("banking complete:true is ILLEGAL while BANK-ECON-02 is FAIL");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-econ-02-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };

  // Copy real wiring files for PASS case.
  for (const rel of [
    "apps/backend/src/banking/categorization.routes.ts",
    FILES.designView,
    FILES.bankingApi,
    FILES.glPosting,
    FILES.bulkJe,
    FILES.step1480,
  ]) {
    const src = path.join(ROOT, rel);
    if (fs.existsSync(src)) {
      mk(rel, fs.readFileSync(src, "utf8"));
    }
  }

  mk(
    FILES.bankingJson,
    JSON.stringify({
      complete: false,
      items: [
        {
          id: "BANK-ECON-02",
          status: "FAIL",
          evidence: "matched_je=3/10628. Poster works (#3424 on main). Density is ops backlog — verify-step 1480 guard.",
          pr: "#3424",
        },
        { id: "BANK-SURF-02", status: "FAIL", evidence: "same as BANK-ECON-02", pr: "#3424" },
      ],
    })
  );

  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));

  // Fake PASS on ECON-02 must FAIL.
  mk(
    FILES.bankingJson,
    JSON.stringify({
      complete: false,
      items: [
        { id: "BANK-ECON-02", status: "PASS", evidence: "all matched", pr: "#3424" },
        { id: "BANK-SURF-02", status: "FAIL", evidence: "x", pr: "#3424" },
      ],
    })
  );
  if (!run(tmp).some((f) => f.includes("BANK-ECON-02"))) throw new Error("expected FAIL on fake PASS");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-econ-02-poster-path-wired --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-econ-02-poster-path-wired FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-econ-02-poster-path-wired — OK (poster wired; density honestly FAIL)");
}
