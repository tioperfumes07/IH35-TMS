/**
 * REG-015 guard (verify-step 11186, Devin 2-mod-4 band):
 * Asserts the 6 former dashed-stub factoring tabs are now real read-only report tabs
 * with real data wiring — not "Not yet wired to real data" placeholders.
 *
 * Tabs: request_debtor_credit_check, debtor_receipts, loan_save, unapplied_cash,
 *       invoice_status_report, messages_support
 *
 * Checks:
 * 1. No dashed-stub block remains in FactoringHome.tsx for these 6 tabs.
 * 2. Each tab has a real data-testid (not factoring-stub-*).
 * 3. The 3 new backend endpoints exist in factoring.routes.ts.
 * 4. The 3 new frontend API functions exist in factoring.ts.
 * 5. The 3 new React Query hooks exist in FactoringHome.tsx.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

const FACTORING_HOME = join(repoRoot, "apps", "frontend", "src", "pages", "factoring", "FactoringHome.tsx");
const FACTORING_API = join(repoRoot, "apps", "frontend", "src", "api", "factoring.ts");
const FACTORING_ROUTES = join(repoRoot, "apps", "backend", "src", "factoring", "factoring.routes.ts");

const SIX_TABS = [
  "request_debtor_credit_check",
  "debtor_receipts",
  "loan_save",
  "unapplied_cash",
  "invoice_status_report",
  "messages_support",
];

// 443.99 class B (CC-2, 2026-10-12) — render-block anchor.
//   old rule: each tab renders behind the literal `tab === "<id>"`.
//   new rule: each tab renders behind `{show("<id>") ? (` — the one section gate FactoringHome uses.
//   why: bdd45147f8 (ROUND-435-CC2, owner's ten-tab set) moved every section behind show(), which maps a
//        section to its parent Faro tab; `tab === "<id>"` no longer appears anywhere in the file, so this
//        check failed on correct code. Not looser: a tab with no show() render block still fails.
export function missingRenderBlocks(home) {
  return SIX_TABS.filter((tab) => !home.includes(`{show("${tab}") ? (`)).map(
    (tab) => `FactoringHome.tsx missing render block for tab "${tab}"`,
  );
}

function selftest() {
  const home = readFileSync(FACTORING_HOME, "utf8");
  const clean = missingRenderBlocks(home);
  if (clean.length) throw new Error(`selftest: real FactoringHome.tsx rejected — ${clean.join("; ")}`);
  const planted = SIX_TABS.map((tab) => [tab, home.replace(`{show("${tab}") ? (`, `{false ? (`)]);
  const escaped = planted.filter(([tab, src]) => !missingRenderBlocks(src).some((f) => f.includes(`"${tab}"`)));
  if (escaped.length) throw new Error(`selftest: removed render block not caught for ${escaped.map(([t]) => t).join(", ")}`);
  console.log(`selftest OK — ${planted.length}/${planted.length} removed render blocks caught; real page passes`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const factoringHome = readFileSync(FACTORING_HOME, "utf8");
  const factoringApi = readFileSync(FACTORING_API, "utf8");
  const factoringRoutes = readFileSync(FACTORING_ROUTES, "utf8");

  const failures = [];

  // 1. No dashed-stub block remains for these 6 tabs.
  if (factoringHome.includes('Not yet wired to real data — this tab exists and is reachable, but its content is a placeholder')) {
    failures.push("FactoringHome.tsx still contains the dashed-stub 'Not yet wired to real data' placeholder text");
  }

  // 2. Each tab has a real data-testid (not factoring-stub-*).
  for (const tab of SIX_TABS) {
    const stubTestId = `factoring-stub-${tab}`;
    if (factoringHome.includes(stubTestId)) {
      failures.push(`FactoringHome.tsx still has stub data-testid="${stubTestId}"`);
    }
    // Check for a real data-testid for this tab.
    const dashedTab = tab.replace(/_/g, "-");
    const realTestIdRegex = new RegExp(`data-testid="factoring-${dashedTab}[^"]*"`);
    if (!realTestIdRegex.test(factoringHome)) {
      failures.push(`FactoringHome.tsx missing real data-testid for tab "${tab}" (expected pattern factoring-${dashedTab})`);
    }
  }

  // 3. The 3 new backend endpoints exist in factoring.routes.ts.
  const expectedEndpoints = [
    "/api/v1/factoring/debtor-receipts",
    "/api/v1/factoring/unapplied-cash",
    "/api/v1/factoring/invoice-status",
  ];
  for (const endpoint of expectedEndpoints) {
    if (!factoringRoutes.includes(endpoint)) {
      failures.push(`factoring.routes.ts missing endpoint "${endpoint}"`);
    }
  }

  // 4. The 3 new frontend API functions exist in factoring.ts.
  const expectedApiFunctions = [
    "getFactoringDebtorReceipts",
    "getFactoringUnappliedCash",
    "getFactoringInvoiceStatus",
  ];
  for (const fn of expectedApiFunctions) {
    if (!factoringApi.includes(fn)) {
      failures.push(`factoring.ts missing API function "${fn}"`);
    }
  }

  // 5. The 3 new React Query hooks exist in FactoringHome.tsx.
  const expectedHooks = [
    "debtorReceiptsQuery",
    "unappliedCashQuery",
    "invoiceStatusQuery",
  ];
  for (const hook of expectedHooks) {
    if (!factoringHome.includes(hook)) {
      failures.push(`FactoringHome.tsx missing React Query hook "${hook}"`);
    }
  }

  // 6. Each tab has a real render block (not just a stub div).
  failures.push(...missingRenderBlocks(factoringHome));

  if (failures.length > 0) {
    console.error(`verify-factoring-six-stubs-real-tabs FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("verify-factoring-six-stubs-real-tabs: OK — 6 tabs are real, 3 endpoints + 3 API functions + 3 hooks present");
}

main();
