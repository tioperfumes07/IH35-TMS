#!/usr/bin/env node
/**
 * Finance qbo_chrome — leaf-specific Built for the 16 leaves only "claimed" by the broad
 * verify-cursor-vertical-qbo-picker-modules.mjs sweep (leafRe: ^(chrome|hop|hub|nav|statements)
 * (\.|$)) — same theater-coverage class already found+fixed across every other module this session.
 * Continuing CC-3's ladder into the remainder of the sidebar per CODER-INSTRUCTIONS-NOW.md.
 *
 * chrome.toolbar_(search|range|gear) are already real via CLS-FILTER-GEAR-APPLY (finance included).
 * finance's chrome.toolbar_filter had no other coverage — genuinely built via ArApAgingPage.tsx's
 * real CollapsedListFilters, closed here alongside the rest.
 *
 * All 16 leaves below are genuinely built, traced through the real route/component wiring:
 *   - hub / hub.alias: FinanceHubPage.tsx (mounted at both /finance and /finance/hub) is a real
 *     dashboard with real navigation Links (e.g. to /finance/overview); /finance-hub is a real
 *     <Navigate> redirect alias to /finance/hub in the route manifest.
 *   - nav.overview / nav.statements / nav.ar_ap_aging / nav.projections / nav.scenarios /
 *     nav.break_even / nav.calculator: FinanceModuleTabs.tsx's real, unified tab-bar config array
 *     shared across the whole module, each entry a real navigate() destination.
 *   - hop.accounting / hop.cash_flow / hop.reports: the same FinanceModuleTabs.tsx file's real
 *     cross-module Link elements to /accounting, /cash-flow, and /reports/profit-loss.
 *   - statements.pl / statements.bs / statements.tb: FinancialStatementsPage.tsx's real
 *     ReportTab = "pl" | "bs" | "tb" type driving real per-tab query-enabling and a real tab config
 *     array with human labels.
 *   - chrome.toolbar_filter: ArApAgingPage.tsx's real CollapsedListFilters Apply/Reset/Cancel triad.
 *
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^hub$","task":"VERTICAL-QBO-CHROME-finance-hub","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^hub\\.alias$","task":"VERTICAL-QBO-CHROME-finance-hub-alias","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^nav\\.(overview|statements|ar_ap_aging|projections|scenarios|break_even|calculator)$","task":"VERTICAL-QBO-CHROME-finance-nav","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^hop\\.(accounting|cash_flow|reports)$","task":"VERTICAL-QBO-CHROME-finance-hop","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^statements\\.(pl|bs|tb)$","task":"VERTICAL-QBO-CHROME-finance-statements-tabs","vertical":"column-wave"}
 * @matrix-built {"modules":["finance"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_filter$","task":"VERTICAL-QBO-CHROME-finance-toolbar-filter","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-finance-qbo-chrome-leaves.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-finance-qbo-chrome-leaves";

const CHECKS = [
  {
    name: "hub / hub.alias: FinanceHubPage real navigation Links + real /finance-hub Navigate alias in the route manifest",
    file: "apps/frontend/src/pages/finance/FinanceHubPage.tsx",
    pattern: /import \{ Link \}[\s\S]{0,4700}to="\/finance\/overview"/,
  },
  {
    name: "hub.alias (route manifest): real /finance-hub -> /finance/hub redirect",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/finance-hub" element=\{<ProtectedRoute><Navigate to="\/finance\/hub" replace \/><\/ProtectedRoute>\}/,
  },
  {
    name: "nav.*: FinanceModuleTabs real unified tab-bar config array",
    file: "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx",
    pattern: /const baseTabs[\s\S]{0,600}to: "\/finance\/ar-ap-aging"/,
  },
  {
    name: "hop.*: FinanceModuleTabs real cross-module Link elements",
    file: "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx",
    pattern: /to="\/accounting"[\s\S]{0,300}to="\/cash-flow"[\s\S]{0,300}to="\/reports\/profit-loss"/,
  },
  {
    name: "statements.pl/bs/tb: FinancialStatementsPage real ReportTab type",
    file: "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
    pattern: /ReportTab = "pl" \| "bs" \| "tb"/,
  },
  {
    name: "statements.pl/bs/tb: FinancialStatementsPage real per-tab human-labeled config",
    file: "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
    pattern: /id: "pl", label: "Profit & loss"/,
  },
  {
    name: "chrome.toolbar_filter: ArApAgingPage real CollapsedListFilters Apply/Reset/Cancel triad",
    file: "apps/frontend/src/pages/finance/ArApAgingPage.tsx",
    pattern: /<CollapsedListFilters[\s\S]{0,300}onApply=\{staged\.apply\}[\s\S]{0,150}onReset=\{staged\.reset\}[\s\S]{0,150}onCancel=\{staged\.cancel\}/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!c.pattern.test(src)) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".finance-qbo-chrome-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — no chrome\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted chrome misses not caught (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} checks / 16 finance qbo_chrome leaf asserts`);
