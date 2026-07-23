#!/usr/bin/env node
/**
 * Banking Full Audit FAIL 32 — Factoring Banking entry ↔ Faro advance both-way.
 * Forward: Banking Factoring tab EntityLink → accounting.factoring_advances.
 * Reverse: FactoringDetailPage → /banking/factoring.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const routes = fs.readFileSync(`${root}/apps/backend/src/banking/factoring-virtual.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  const detail = fs.readFileSync(
    `${root}/apps/frontend/src/pages/accounting/FactoringDetailPage.tsx`,
    "utf8"
  );
  const entityLink = fs.readFileSync(`${root}/apps/frontend/src/components/shared/EntityLink.tsx`, "utf8");

  if (!routes.includes("/api/v1/banking/factoring-virtual/timeline")) {
    failures.push("factoring-virtual routes must expose /timeline");
  }
  if (!routes.includes("FROM accounting.factoring_advances") || !routes.includes("display_id")) {
    failures.push("timeline must SELECT canonical accounting.factoring_advances (incl. display_id)");
  }
  if (/factoring-virtual\/timeline[\s\S]{0,1200}SELECT \*/.test(routes)) {
    failures.push("timeline must not SELECT * (explicit columns only)");
  }
  if (!api.includes("getFactoringVirtualTimeline")) {
    failures.push("api client missing getFactoringVirtualTimeline");
  }
  if (!home.includes("getFactoringVirtualTimeline")) {
    failures.push("BankingHome must call getFactoringVirtualTimeline");
  }
  if (!home.includes('data-testid="banking-factoring-faro-advances-panel"')) {
    failures.push("BankingHome must render banking-factoring-faro-advances-panel");
  }
  if (!home.includes('kind="factoring_advance"') && !home.includes("kind='factoring_advance'")) {
    failures.push("Banking Factoring tab must EntityLink kind=factoring_advance");
  }
  if (!detail.includes('data-testid="factoring-advance-banking-reverse-link"')) {
    failures.push("FactoringDetailPage must link back to Banking Factoring entry");
  }
  if (!detail.includes("/banking/factoring")) {
    failures.push("FactoringDetailPage reverse must target /banking/factoring");
  }
  if (!entityLink.includes('case "factoring_advance"') || !entityLink.includes("/accounting/factoring/")) {
    failures.push('EntityLink factoring_advance must resolve to /accounting/factoring/:id');
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-faro-advance-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/banking/factoring-virtual.routes.ts",
    `/api/v1/banking/factoring-virtual/timeline\nFROM accounting.factoring_advances\ndisplay_id\n`
  );
  mk("apps/frontend/src/api/banking.ts", "export function getFactoringVirtualTimeline() {}\n");
  mk(
    "apps/frontend/src/pages/banking/BankingHome.tsx",
    `getFactoringVirtualTimeline\ndata-testid="banking-factoring-faro-advances-panel"\nkind="factoring_advance"\n`
  );
  mk(
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    `data-testid="factoring-advance-banking-reverse-link"\n/banking/factoring\n`
  );
  mk(
    "apps/frontend/src/components/shared/EntityLink.tsx",
    `case "factoring_advance":\n      return \`/accounting/factoring/\${id}\`;\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/BankingHome.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-faro-advance-linkage --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-faro-advance-linkage — OK");
}
