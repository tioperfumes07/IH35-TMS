#!/usr/bin/env node
/**
 * FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY
 *
 * views.factoring_summary's `chargeback_balance` column (and its factoring-virtual/factoring
 * API/frontend mirrors) is actually SUM(outstanding_liability_signed_cents) — Advance + Reserve
 * still owed to the factor — NOT a real chargeback/recourse figure (views.factoring_chargebacks_fees
 * hardcodes 0::numeric AS chargeback_amount; that data model doesn't exist yet). This guard locks
 * the honest rename (Option 1): every reader of the balance must expose/consume
 * `outstanding_liability_balance` and the visible UI labels must say "Outstanding Liability", not
 * "Chargeback Balance" / "Chargebacks Pending" / "Chargebacks open" for THIS figure.
 *
 * `chargeback_balance` stays on the wire for any reader not yet migrated — this guard does not
 * require removing it, only that the honest field/label exists alongside it.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const read = (rel) => {
    try {
      return fs.readFileSync(`${root}/${rel}`, "utf8");
    } catch {
      return null;
    }
  };

  const checks = [
    {
      file: "apps/frontend/src/api/banking.ts",
      mustInclude: ["outstanding_liability_balance: number"],
    },
    {
      file: "apps/frontend/src/api/factoring.ts",
      mustInclude: ["outstanding_liability_balance: number"],
    },
    {
      file: "apps/backend/src/banking/factoring-virtual.routes.ts",
      mustInclude: ["AS outstanding_liability_balance"],
    },
    {
      file: "apps/backend/src/factoring/factoring.routes.ts",
      mustInclude: ["outstanding_liability_balance: 0"],
    },
    {
      file: "apps/frontend/src/pages/factoring/FactoringHome.tsx",
      mustInclude: ["summary?.outstanding_liability_balance", "Outstanding Liability Balance"],
      mustNotInclude: [">Chargeback Balance<"],
    },
    {
      file: "apps/frontend/src/pages/factoring/ReserveTracker.tsx",
      mustInclude: ['summaryQ.data?.outstanding_liability_balance', 'label="Outstanding Liability"'],
      mustNotInclude: ['label="Chargebacks Pending"'],
    },
    {
      file: "apps/frontend/src/pages/banking/BankingHome.tsx",
      mustInclude: ["row.outstanding_liability_balance", "factoringOutstandingLiability"],
      mustNotInclude: [">Chargebacks open<", "factoringChargebacks"],
    },
  ];

  for (const { file, mustInclude, mustNotInclude } of checks) {
    const content = read(file);
    if (content === null) {
      failures.push(`${file}: missing`);
      continue;
    }
    for (const needle of mustInclude ?? []) {
      if (!content.includes(needle)) {
        failures.push(`${file}: missing required "${needle}"`);
      }
    }
    for (const needle of mustNotInclude ?? []) {
      if (content.includes(needle)) {
        failures.push(`${file}: must not contain stale "${needle}"`);
      }
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-factoring-outstanding-liability-");
  const files = {
    "apps/frontend/src/api/banking.ts": "outstanding_liability_balance: number;\n",
    "apps/frontend/src/api/factoring.ts": "outstanding_liability_balance: number;\n",
    "apps/backend/src/banking/factoring-virtual.routes.ts":
      "SELECT 1 AS outstanding_liability_balance\n",
    "apps/backend/src/factoring/factoring.routes.ts": "outstanding_liability_balance: 0,\n",
    "apps/frontend/src/pages/factoring/FactoringHome.tsx":
      "summary?.outstanding_liability_balance\nOutstanding Liability Balance\n",
    "apps/frontend/src/pages/factoring/ReserveTracker.tsx":
      'summaryQ.data?.outstanding_liability_balance\nlabel="Outstanding Liability"\n',
    "apps/frontend/src/pages/banking/BankingHome.tsx":
      "row.outstanding_liability_balance\nfactoringOutstandingLiability\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = `${tmp}/${rel}`;
    fs.mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(full, content);
  }
  if (run(tmp).length) throw new Error("PASS fail: " + JSON.stringify(run(tmp)));

  // Mutate: revert BankingHome.tsx to the pre-fix stale shape.
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    "row.chargeback_balance\nfactoringChargebacks\n>Chargebacks open<\n"
  );
  const failed = run(tmp);
  if (!failed.length) throw new Error("FAIL fail: mutation should have been caught");

  // Mutate: revert FactoringHome.tsx label.
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    files["apps/frontend/src/pages/banking/BankingHome.tsx"]
  );
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/factoring/FactoringHome.tsx`,
    ">Chargeback Balance<\n"
  );
  const failed2 = run(tmp);
  if (!failed2.length) throw new Error("FAIL fail (FactoringHome mutation should have been caught)");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-factoring-outstanding-liability-honest-label --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-factoring-outstanding-liability-honest-label — OK");
}
