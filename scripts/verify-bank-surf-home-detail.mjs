#!/usr/bin/env node
/**
 * BANK-F04 / BANK-SURF-01 — Banking Home + account detail surfaces are mounted on
 * canonical routes and read banking.* (never RETIRE bank.*).
 *
 * Static structural prove (DoD A / VERIFY-3 / VERIFY-7). Does not claim live economics.
 *
 * Self-test: node scripts/verify-bank-surf-home-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  detail: "apps/frontend/src/pages/banking/BankAccountDetail.tsx",
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routes: "apps/frontend/src/router/route-manifest.ts",
  api: "apps/frontend/src/api/banking.ts",
};

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

  const manifest = read(FILES.manifest);
  const home = read(FILES.home);
  const detail = read(FILES.detail);
  const nav = read(FILES.nav);
  const routes = read(FILES.routes);
  const api = read(FILES.api);

  for (const p of ['path="/banking"', 'path="/banking/accounts/:id"', 'path="/banking/transactions"']) {
    if (!manifest.includes(p)) failures.push(`manifest missing ${p}`);
  }

  if (!nav.includes('id: "accounts"') || !nav.includes('id: "transactions"')) {
    failures.push("BANKING_MODULE_TABS must include accounts + transactions");
  }

  if (!routes.includes('"/banking"') || !routes.includes('"/banking/transactions"')) {
    failures.push("route-manifest must register Banking Home + transactions");
  }

  if (!home.includes("BankingTransactionsDesignView") && !home.includes("activeTab")) {
    failures.push("BankingHome must render tabbed banking surfaces");
  }

  if (!detail.includes("export function BankAccountDetailPage")) {
    failures.push("BankAccountDetailPage must remain the live account detail export");
  }

  if (!detail.includes("BankingTransactionsDesignView")) {
    failures.push("BankAccountDetail must mount BankingTransactionsDesignView (live register)");
  }

  // Canonical banking.* API client — never RETIRE bank.* schema string in FE api.
  if (/['`]bank\./.test(api) || /FROM\s+bank\./i.test(api)) {
    failures.push("apps/frontend/src/api/banking.ts must not reference RETIRE bank.*");
  }
  if (!/banking\//.test(api) && !/\/api\/v1\/banking/.test(api)) {
    failures.push("banking API client must call /api/v1/banking/*");
  }

  // Archived table stays present (never-delete) but must not be the live export path.
  if (!detail.includes("ArchivedBankAccountDetailTable")) {
    failures.push("ArchivedBankAccountDetailTable must remain (archive-never-delete)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-surf-home-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  mk(
    FILES.manifest,
    `path="/banking"\npath="/banking/accounts/:id"\npath="/banking/transactions"\n`
  );
  mk(FILES.home, `activeTab\nBankingTransactionsDesignView\n`);
  mk(
    FILES.detail,
    `export function BankAccountDetailPage() {}\nBankingTransactionsDesignView\nArchivedBankAccountDetailTable\n`
  );
  mk(FILES.nav, `id: "accounts"\nid: "transactions"\n`);
  mk(FILES.routes, `"/banking"\n"/banking/transactions"\n`);
  mk(FILES.api, `fetch("/api/v1/banking/accounts")\n`);
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));
  mk(FILES.api, `FROM bank.bank_transactions\n`);
  if (!run(tmp).length) throw new Error("expected FAIL on bank.*");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-surf-home-detail --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-surf-home-detail FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-surf-home-detail — OK (BANK-SURF-01 structural)");
}
