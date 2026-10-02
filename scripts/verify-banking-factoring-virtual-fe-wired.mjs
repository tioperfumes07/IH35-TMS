#!/usr/bin/env node
// verify-banking-factoring-virtual-fe-wired (0441-mod8) — locks FE wiring so Banking Home reads the
// outstanding-liability balance from GET /api/v1/banking/factoring-virtual, not the stale
// views.banking_account_tiles / dashboard KPI proxy that showed $0.
// ROUND 326.2 item 3: the RESERVE no longer comes from factoring-virtual — Banking reads the factoring KPI
// engine (getFactoringKpis, escrow + cash reserve roles) so Factoring and Banking share one reserve engine.
//
// Self-test: node scripts/verify-banking-factoring-virtual-fe-wired.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANKING_API = "apps/frontend/src/api/banking.ts";
const BANKING_HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";

export function check({ bankingApi, bankingHome }) {
  const f = [];

  if (!/\/api\/v1\/banking\/factoring-virtual/.test(bankingApi))
    f.push(`${BANKING_API}: must export getFactoringVirtual calling /api/v1/banking/factoring-virtual`);
  if (!/export\s+function\s+getFactoringVirtual/.test(bankingApi))
    f.push(`${BANKING_API}: must export getFactoringVirtual`);
  if (!/outstanding_liability_balance/.test(bankingApi))
    f.push(`${BANKING_API}: FactoringVirtualCompany must include outstanding_liability_balance`);
  if (/^\s*reserve_balance\s*:/m.test(bankingApi))
    f.push(`${BANKING_API}: FactoringVirtualCompany must NOT carry reserve_balance (second reserve engine)`);

  if (!/getFactoringVirtual/.test(bankingHome))
    f.push(`${BANKING_HOME}: must import and call getFactoringVirtual`);
  if (!/factoringVirtualQuery/.test(bankingHome))
    f.push(`${BANKING_HOME}: must use a factoringVirtualQuery (react-query) for the virtual bank panel`);
  if (!/getFactoringKpis/.test(bankingHome) || !/"escrow_reserve_balance"/.test(bankingHome) || !/"cash_reserve_balance"/.test(bankingHome))
    f.push(`${BANKING_HOME}: factoringReserve must come from the factoring KPI engine (escrow + cash reserve)`);
  if (/factoringVirtualSummary\.reserve\b|row\.reserve_balance/.test(bankingHome))
    f.push(`${BANKING_HOME}: must NOT sum reserve from factoring-virtual (second reserve engine)`);
  if (/factoringReserve\s*=\s*Number\(\s*kpiQuery\.data\?\.factoring_reserve/.test(bankingHome))
    f.push(`${BANKING_HOME}: must NOT derive factoringReserve from kpiQuery.data?.factoring_reserve (stale tile view proxy)`);
  if (!/factoringVirtualSummary\.outstandingLiability/.test(bankingHome))
    f.push(`${BANKING_HOME}: factoring panel must read factoringVirtualSummary.outstandingLiability`);
  if (!/row\.outstanding_liability_balance/.test(bankingHome))
    f.push(`${BANKING_HOME}: factoring summary must aggregate row.outstanding_liability_balance`);
  if (/factoringVirtualSummary\.chargeback|Number\(\s*row\.chargeback_balance/.test(bankingHome))
    f.push(`${BANKING_HOME}: must not relabel outstanding liability as chargeback`);
  if (/Chargebacks open[\s\S]{0,120}money\.format\(0\)/.test(bankingHome))
    f.push(`${BANKING_HOME}: chargebacks open must not hardcode money.format(0)`);

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const bankingApi = read(BANKING_API);
  const bankingHome = read(BANKING_HOME);
  const missing = [];
  if (bankingApi === null) missing.push(`${BANKING_API} not found`);
  if (bankingHome === null) missing.push(`${BANKING_HOME} not found`);
  if (missing.length) return missing;
  return check({ bankingApi, bankingHome });
}

if (process.argv.includes("--selftest")) {
  const goodApi = `
    export type FactoringVirtualCompany = { chargeback_balance: number; outstanding_liability_balance: number; };
    export function getFactoringVirtual(companyId: string) {
      return apiRequest<{ companies: FactoringVirtualCompany[] }>(\`/api/v1/banking/factoring-virtual?\${q(companyId)}\`);
    }
  `;
  const goodHome = `
    import { getFactoringVirtual } from "../../api/banking";
    import { getFactoringKpis } from "../../api/factoring-kpis";
    const factoringVirtualQuery = useQuery({ queryFn: () => getFactoringVirtual(companyId) });
    const factoringVirtualSummary = useMemo(() => ({
      outstandingLiability: row.outstanding_liability_balance,
    }), []);
    const factoringKpiQuery = useQuery({ queryFn: () => getFactoringKpis(companyId) });
    const factoringReserve = cents("escrow_reserve_balance") + cents("cash_reserve_balance");
    const factoringOutstandingLiability = factoringVirtualSummary.outstandingLiability;
    <span>Outstanding liability</span><span>{money.format(factoringOutstandingLiability)}</span>
  `;
  const badHome = `
    const factoringReserve = Number(kpiQuery.data?.factoring_reserve ?? 0);
    <span>Chargebacks open</span><span>{money.format(0)}</span>
  `;

  const checks = [
    ["healthy wiring passes", check({ bankingApi: goodApi, bankingHome: goodHome }).length === 0],
    [
      "missing getFactoringVirtual export caught",
      check({ bankingApi: `// empty`, bankingHome: goodHome }).some((x) => x.includes(BANKING_API)),
    ],
    [
      "kpi proxy regression caught",
      check({ bankingApi: goodApi, bankingHome: badHome }).length >= 2,
    ],
    [
      "dishonest chargeback alias regression caught",
      check({
        bankingApi: goodApi,
        bankingHome: goodHome
          .replaceAll("outstandingLiability", "chargeback")
          .replace("row.outstanding_liability_balance", "row.chargeback_balance"),
      }).some((x) => x.includes("must not relabel")),
    ],
    [
      "second reserve engine (factoring-virtual reserve sum) caught",
      check({ bankingApi: goodApi, bankingHome: goodHome + "\n const r = factoringVirtualSummary.reserve;" }).some((x) => x.includes("second reserve engine")),
    ],
    [
      "missing honest API field caught",
      check({
        bankingApi: goodApi.replace("outstanding_liability_balance: number;", ""),
        bankingHome: goodHome,
      }).some((x) => x.includes("outstanding_liability_balance")),
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:banking-factoring-virtual-fe-wired --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:banking-factoring-virtual-fe-wired --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error("verify:banking-factoring-virtual-fe-wired FAIL:");
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:banking-factoring-virtual-fe-wired PASS");
}
