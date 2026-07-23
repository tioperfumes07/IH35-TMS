#!/usr/bin/env node
/**
 * verify-banking-active-categorize-path.mjs
 *
 * Dual-path smell guard: Workflow-B (BankTxCategorizationPage + CategorizeDrawer chain) vs the
 * single LIVE categorize surface (BankingTransactionsDesignView).
 *
 * Proves operators always land on the live QBO-parity register — never a resurrected Workflow-B page:
 *   1. manifest.tsx does NOT mount BankTxCategorizationPage (lazy import or element).
 *   2. LIVE mounts: BankingHome + BankAccountDetail both render <BankingTransactionsDesignView>.
 *   3. Legacy alias routes redirect to the live transactions register (not catch-all Home).
 *   4. @archived Workflow-B page stays present + annotated (archive-not-delete).
 *
 * Companions: verify-banking-workflow-b-archived.mjs, verify-dead-forms-unmounted.mjs,
 * verify-banking-register-categorize-capable.mjs.
 *
 * Self-test: node scripts/verify-banking-active-categorize-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const MANIFEST_REL = "apps/frontend/src/routes/manifest.tsx";
const HOME_REL = "apps/frontend/src/pages/banking/BankingHome.tsx";
const DETAIL_REL = "apps/frontend/src/pages/banking/BankAccountDetail.tsx";
const DESIGN_VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";
const OLD_PAGE_REL = "apps/frontend/src/pages/banking/BankTxCategorizationPage.tsx";

const ARCHIVE_MARKER = "@archived — Workflow-B";

/** Escape all RegExp metacharacters (incl. `\`) — CodeQL js/incomplete-sanitization. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legacy URLs that must redirect to the live categorize register (bookmark/deep-link safety). */
const LEGACY_REDIRECTS = [
  {
    path: "/banking/uncategorized",
    target: 'Navigate to="/banking/transactions?type=uncategorized"',
  },
  {
    path: "/banking/categorize",
    target: 'Navigate to="/banking/transactions?type=uncategorized"',
  },
];

/**
 * @param {{ manifestSrc: string, homeSrc: string, detailSrc: string, designViewSrc: string, oldPageSrc: string }} input
 * @returns {string[]}
 */
export function evaluateActiveCategorizePath(input) {
  const failures = [];
  const { manifestSrc, homeSrc, detailSrc, designViewSrc, oldPageSrc } = input;

  // (1) Workflow-B page must NOT be wired as a route (ignore comment-only mentions).
  if (
    /React\.lazy\(\(\)\s*=>\s*import\([^)]*BankTxCategorizationPage/.test(manifestSrc) ||
    /<BankTxCategorizationPage\b/.test(manifestSrc)
  ) {
    failures.push(`${MANIFEST_REL} — must NOT import or mount BankTxCategorizationPage (Workflow-B is @archived)`);
  }

  // (2) LIVE categorize surface mounts.
  if (!homeSrc.includes("<BankingTransactionsDesignView")) {
    failures.push(`${HOME_REL} — Transactions tab must render <BankingTransactionsDesignView> (live categorize register)`);
  }
  if (!detailSrc.includes("<BankingTransactionsDesignView")) {
    failures.push(`${DETAIL_REL} — /banking/accounts/:id must render <BankingTransactionsDesignView> (live categorize register)`);
  }
  if (!designViewSrc.includes("categorizeBankTransaction(")) {
    failures.push(`${DESIGN_VIEW_REL} — live register must call categorizeBankTransaction(`);
  }
  // Deep-link honesty: ?type=uncategorized must update the filter after mount (not mount-only useState).
  if (!designViewSrc.includes("setSelectedTransactionType(initialTransactionType")) {
    failures.push(
      `${DESIGN_VIEW_REL} — must sync selectedTransactionType when initialTransactionType changes (deep-link ?type=)`,
    );
  }

  // (3) manifest routes the transactions tab (canonical URL).
  if (!manifestSrc.includes('path="/banking/transactions"')) {
    failures.push(`${MANIFEST_REL} — missing canonical live route path="/banking/transactions"`);
  }
  if (!manifestSrc.includes('<BankingHomePage initialTab="transactions"')) {
    failures.push(`${MANIFEST_REL} — /banking/transactions must mount BankingHomePage initialTab="transactions"`);
  }

  // (4) Legacy alias redirects → live surface (not silent Home redirect).
  for (const { path: legacyPath, target } of LEGACY_REDIRECTS) {
    if (!manifestSrc.includes(`path="${legacyPath}"`)) {
      failures.push(`${MANIFEST_REL} — missing legacy alias route path="${legacyPath}" (archive+redirect)`);
      continue;
    }
    const blockRe = new RegExp(
      `path="${escapeRegExp(legacyPath)}"[\\s\\S]{0,400}?${escapeRegExp(target)}`,
    );
    if (!blockRe.test(manifestSrc)) {
      failures.push(`${MANIFEST_REL} — path="${legacyPath}" must ${target}`);
    }
  }

  // (5) BankingHome honors ?type=uncategorized from the legacy redirect.
  if (!homeSrc.includes('searchParams.get("type")') || !homeSrc.includes('"uncategorized"')) {
    failures.push(`${HOME_REL} — must read searchParams type=uncategorized for legacy /banking/uncategorized redirect`);
  }

  // (6) @archived Workflow-B page stays present (never delete modules).
  if (!oldPageSrc.includes(ARCHIVE_MARKER)) {
    failures.push(`${OLD_PAGE_REL} — must carry "${ARCHIVE_MARKER}" (archive-not-delete)`);
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function runReal() {
  const failures = evaluateActiveCategorizePath({
    manifestSrc: readRepo(MANIFEST_REL),
    homeSrc: readRepo(HOME_REL),
    detailSrc: readRepo(DETAIL_REL),
    designViewSrc: readRepo(DESIGN_VIEW_REL),
    oldPageSrc: readRepo(OLD_PAGE_REL),
  });
  if (failures.length > 0) {
    console.error("[verify-banking-active-categorize-path] FAIL:");
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    "[verify-banking-active-categorize-path] OK — Workflow-B unmounted; live categorize = BankingTransactionsDesignView on /banking/transactions + /banking/accounts/:id; legacy aliases redirect",
  );
}

function runSelftest() {
  const goodManifest = `
    path="/banking/transactions"
    <BankingHomePage initialTab="transactions"
    path="/banking/uncategorized"
    <Navigate to="/banking/transactions?type=uncategorized" replace />
    path="/banking/categorize"
    <Navigate to="/banking/transactions?type=uncategorized" replace />
  `;
  const goodHome =
    'searchParams.get("type") === "uncategorized" setTransactionsInitialFilter("uncategorized") <BankingTransactionsDesignView';
  const goodDetail = "<BankingTransactionsDesignView selectedAccountId={id} />";
  const goodDesign = "categorizeBankTransaction( setSelectedTransactionType(initialTransactionType";
  const goodOld = `${ARCHIVE_MARKER} superseded`;

  const cases = [
    {
      name: "healthy: live mounts + legacy redirects + archived old page",
      input: {
        manifestSrc: goodManifest,
        homeSrc: goodHome,
        detailSrc: goodDetail,
        designViewSrc: goodDesign,
        oldPageSrc: goodOld,
      },
      expectPass: true,
    },
    {
      name: "regression: Workflow-B remounted in manifest",
      input: {
        manifestSrc: goodManifest + " <BankTxCategorizationPage />",
        homeSrc: goodHome,
        detailSrc: goodDetail,
        designViewSrc: goodDesign,
        oldPageSrc: goodOld,
      },
      expectPass: false,
    },
    {
      name: "regression: legacy /banking/uncategorized missing redirect",
      input: {
        manifestSrc: goodManifest.replace('path="/banking/uncategorized"', ""),
        homeSrc: goodHome,
        detailSrc: goodDetail,
        designViewSrc: goodDesign,
        oldPageSrc: goodOld,
      },
      expectPass: false,
    },
    {
      name: "regression: BankingHome lost uncategorized query param wiring",
      input: {
        manifestSrc: goodManifest,
        homeSrc: "setTransactionsInitialFilter",
        detailSrc: goodDetail,
        designViewSrc: goodDesign,
        oldPageSrc: goodOld,
      },
      expectPass: false,
    },
  ];

  let ok = true;
  for (const c of cases) {
    const failures = evaluateActiveCategorizePath(c.input);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(
        `  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"} (${failures.join("; ")})`,
      );
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log("[verify-banking-active-categorize-path] --selftest OK");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
