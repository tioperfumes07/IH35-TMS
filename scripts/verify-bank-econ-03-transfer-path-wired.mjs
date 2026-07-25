#!/usr/bin/env node
/**
 * BANK-ECON-03 / BANK-SURF-03 — honesty + keep-guards.
 *
 * Transfer mint path (#3445 merged on main) must stay wired via markBankFeedLineAsTransfer();
 * manifest must stay FAIL with honest transfers=0 until operator use — never invent count>0 PASS.
 *
 * Pins: verify-bank-feed-mark-transfer-writes-transfers + verify-banking-transfers-empty-honesty + banking.json.
 *
 * Self-test: node scripts/verify-bank-econ-03-transfer-path-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  bankingJson: "docs/module-completion/banking.json",
  markTransfer: "scripts/verify-bank-feed-mark-transfer-writes-transfers.mjs",
  emptyHonesty: "scripts/verify-banking-transfers-empty-honesty.mjs",
  transfersPage: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
  step1481: "scripts/verify-steps/1481-verify-bank-econ-03-transfer-path-wired.mjs",
};

function runSubGuard(root, rel) {
  try {
    execSync(`node ${path.join(root, rel)}`, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    return [];
  } catch (e) {
    const err = e.stderr?.toString() || e.stdout?.toString() || e.message;
    return [err.trim().split("\n")[0] || `${rel} failed`];
  }
}

export function run(root = ROOT, { skipSubGuards = false } = {}) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  // 1. Existing mark-as-transfer wiring guard must pass (#3445 path).
  if (!skipSubGuards) {
    failures.push(...runSubGuard(root, FILES.markTransfer));
    failures.push(...runSubGuard(root, FILES.emptyHonesty));
  }

  for (const rel of skipSubGuards
    ? [FILES.step1481]
    : [FILES.markTransfer, FILES.emptyHonesty, FILES.step1481]) {
    if (!fs.existsSync(path.join(root, rel))) {
      failures.push(`missing ${rel}`);
    }
  }

  if (skipSubGuards) {
    // Honesty-only mode (selftest tmp): banking.json checks only; wiring verified on real repo.
  }

  // 3. Transfers surface must exist with honesty banner.
  const transfersPage = read(FILES.transfersPage);
  if (!transfersPage.includes('data-testid="banking-transfers-never-recorded-banner"')) {
    failures.push("TransfersListPage must keep empty-transfers honesty banner");
  }

  // 4. banking.json honesty — FAIL + transfers=0 until operator use.
  let parsed;
  try {
    parsed = JSON.parse(read(FILES.bankingJson));
  } catch {
    failures.push("docs/module-completion/banking.json must parse");
    return failures;
  }
  const items = parsed.items || [];
  const econ03 = items.find((i) => i.id === "BANK-ECON-03");
  const surf03 = items.find((i) => i.id === "BANK-SURF-03");

  if (!econ03) {
    failures.push("banking.json must include BANK-ECON-03");
  } else {
    if (econ03.status === "PASS") {
      failures.push("BANK-ECON-03 must remain FAIL — do not invent transfers>0 PASS while Neon count=0");
    }
    const ev = String(econ03.evidence || "");
    if (!/transfers\s*=\s*0|transfers=0|count\s*>\s*0|operator use/i.test(ev)) {
      failures.push("BANK-ECON-03 evidence must honestly state transfers=0 until operator use");
    }
    if (!/markBankFeedLineAsTransfer|#3445/i.test(ev + String(econ03.pr || ""))) {
      failures.push("BANK-ECON-03 must cite markBankFeedLineAsTransfer / #3445 (merged on main)");
    }
    if (/NOT yet merged|\[HOLD\].*not yet merged/i.test(ev)) {
      failures.push("BANK-ECON-03 evidence must not claim #3445 unmerged — it is MERGED on main");
    }
    if (!/1481|verify-bank-econ-03-transfer-path-wired/i.test(ev)) {
      failures.push("BANK-ECON-03 evidence must cite verify-step 1481 guard");
    }
  }

  if (!surf03) {
    failures.push("banking.json must include BANK-SURF-03");
  } else if (surf03.status === "PASS") {
    failures.push("BANK-SURF-03 must remain FAIL while transfers=0 on prod");
  } else {
    const ev = String(surf03.evidence || "");
    if (/NOT yet merged|\[HOLD\].*not yet merged/i.test(ev)) {
      failures.push("BANK-SURF-03 evidence must not claim #3445 unmerged");
    }
  }

  if (parsed.complete === true) {
    failures.push("banking complete:true is ILLEGAL while BANK-ECON-03 is FAIL");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  // Wiring checks on real repo (sub-guards read from script location, not tmp).
  if (run(ROOT).length) throw new Error("expected PASS on repo: " + run(ROOT).join("; "));

  const tmp = fs.mkdtempSync("/tmp/verify-bank-econ-03-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };

  mk(
    FILES.bankingJson,
    JSON.stringify({
      complete: false,
      items: [
        {
          id: "BANK-ECON-03",
          status: "FAIL",
          evidence:
            "LIVE: transfers=0. markBankFeedLineAsTransfer() wired (#3445 merged on main). FAIL until operator use makes count>0. verify-step 1481 guard.",
          pr: "#3445",
        },
        {
          id: "BANK-SURF-03",
          status: "FAIL",
          evidence: "transfers=0; poster path wired (#3445 merged); see BANK-ECON-03",
          pr: "#3445",
        },
      ],
    })
  );
  mk(
    FILES.transfersPage,
    `data-testid="banking-transfers-never-recorded-banner"\nnot proven live until at least one transfer\n`
  );
  mk(FILES.step1481, fs.readFileSync(path.join(ROOT, FILES.step1481), "utf8"));

  if (run(tmp, { skipSubGuards: true }).length) {
    throw new Error("expected PASS on tmp honesty: " + run(tmp, { skipSubGuards: true }).join("; "));
  }

  mk(
    FILES.bankingJson,
    JSON.stringify({
      complete: false,
      items: [
        { id: "BANK-ECON-03", status: "PASS", evidence: "transfers live", pr: "#3445" },
        { id: "BANK-SURF-03", status: "FAIL", evidence: "x", pr: "#3445" },
      ],
    })
  );
  if (!run(tmp, { skipSubGuards: true }).some((f) => f.includes("BANK-ECON-03"))) {
    throw new Error("expected FAIL on fake PASS");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-econ-03-transfer-path-wired --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-econ-03-transfer-path-wired FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-econ-03-transfer-path-wired — OK (transfer path wired; transfers=0 honestly FAIL)");
}
