#!/usr/bin/env node
/** Banking Full Audit economics — for-review backlog honesty + categorize deep link. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  if (!home.includes('data-testid="banking-forreview-backlog-banner"')) {
    failures.push("missing for-review backlog honesty banner");
  }
  if (!home.includes("still need Match/Categorize")) {
    failures.push("banner must name Match/Categorize as the active path");
  }
  if (!home.includes("Do not treat a large for-review queue as")) {
    failures.push("banner must refuse fake caught-up / reconciled implication");
  }
  if (!home.includes("?type=uncategorized")) {
    failures.push("Uncategorized KPI / focus must deep-link ?type=uncategorized");
  }
  if (!manifest.includes('Navigate to="/banking/transactions?type=uncategorized"')) {
    failures.push("/banking/categorize must redirect to transactions?type=uncategorized");
  }
  if (manifest.includes('path="/banking/categorize"') && /path="\/banking\/categorize"[\s\S]{0,200}Navigate to="\/banking\/transactions"/m.test(manifest)
    && !/path="\/banking\/categorize"[\s\S]{0,200}type=uncategorized/m.test(manifest)) {
    failures.push("/banking/categorize still redirects without type=uncategorized");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-forreview-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });
  fs.mkdirSync(`${tmp}/apps/frontend/src/routes`, { recursive: true });
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-forreview-backlog-banner"\nstill need Match/Categorize\nDo not treat a large for-review queue as\n?type=uncategorized\n`
  );
  fs.writeFileSync(
    `${tmp}/apps/frontend/src/routes/manifest.tsx`,
    `path="/banking/categorize"\n<Navigate to="/banking/transactions?type=uncategorized" replace />\n`
  );
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-forreview-match-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-forreview-match-honesty — OK");
}
