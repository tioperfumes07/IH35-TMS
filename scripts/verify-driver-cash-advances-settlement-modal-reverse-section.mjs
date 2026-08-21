#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["reverse_link"],"leafRe":"^(cash_advances|settlements\\.(drawer\\.(advance_detail|liability_detail)|modal\\.(mark_disbursed|hold_deduction|liability_breakdown)|panel\\.pay_run_close))$","task":"LINK-F5185-settlements-reverse-cluster"} */
/**
 * GUARD: closes all 7 of the original open LINK-F5171 settlements reverse_link leaves
 * (settlements:disputes/liabilities.list were already closed in PR #6740).
 *
 * TWO leaves genuinely needed new code (driver_finance.cash_advance_requests.driver_id was never
 * used as a query filter on the pending-review endpoint):
 *   - settlements:cash_advances — driver's own pending cash-advance requests.
 *   - settlements:drawer.advance_detail / settlements:modal.mark_disbursed — same root cause,
 *     closed together: CashAdvancesHome.tsx already accepted ?driver_id=/?advance_id= (LAW OF THE
 *     LAND §9, 2026-07-22) and its AdvanceDetailDrawer already wires onMarkDisbursed to
 *     MarkDisbursedModal; only the driver-profile reverse section was missing.
 *
 * FOUR leaves were already fully reverse-wired end to end before this guard — this guard PINS
 * that pre-existing chain rather than rebuilding it (verified live in the current tree, not
 * assumed from an older claim):
 *   - settlements:modal.hold_deduction, settlements:modal.liability_breakdown,
 *     settlements:panel.pay_run_close — all three live inside SettlementDetailPage.tsx, which
 *     DriverProfilePage.tsx's pre-existing SettlementsSection already reaches via
 *     EntityLink kind="settlement" -> /driver-finance/settlements?settlement_id=<id> ->
 *     SettlementsPage.tsx renders <SettlementDetailPage /> on that param -> SettlementDetailPage
 *     unconditionally imports+mounts PayRunClosePanel and the Liability/HoldDeduction modal pair.
 *   - settlements:drawer.liability_detail — DriverProfilePage.tsx's pre-existing
 *     DriverSettlementFinanceReverseSection (PR #6740) already EntityLinks each driver liability
 *     (kind="liability" -> /liabilities?liability_id=<id>); LiabilitiesHome.tsx already reads
 *     liability_id and opens LiabilityDetailDrawer. That code existed since #6740 but had no
 *     guard proving/locking it, so the scoreboard's matrix-built system never counted it Built —
 *     pinned here, not rebuilt.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAR_SERVICE = "apps/backend/src/driver-finance/cash-advance-requests.service.ts";
const CAR_ROUTES = "apps/backend/src/driver-finance/cash-advance-requests.routes.ts";
const CAR_API = "apps/frontend/src/api/cashAdvanceRequests.ts";
const CAR_PAGE = "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx";
const CA_HOME = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";
const DRIVER_SECTION = "apps/frontend/src/components/driver-profile/DriverCashAdvancesReverseSection.tsx";
const DRIVER_PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const SETTLEMENTS_SECTION = "apps/frontend/src/components/driver-profile/SettlementsSection.tsx";
const SETTLEMENTS_PAGE = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
const SETTLEMENT_DETAIL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const SETTLEMENT_FINANCE_SECTION = "apps/frontend/src/components/driver-profile/DriverSettlementFinanceReverseSection.tsx";
const LIABILITIES_HOME = "apps/frontend/src/pages/liabilities/LiabilitiesHome.tsx";
const MATRIX = "docs/specs/scoreboard/modules/settlements.required.json";
const CLAIMED_LEAVES = [
  "cash_advances",
  "settlements.drawer.advance_detail",
  "settlements.drawer.liability_detail",
  "settlements.modal.mark_disbursed",
  "settlements.modal.hold_deduction",
  "settlements.modal.liability_breakdown",
  "settlements.panel.pay_run_close",
];
const FILES = [
  CAR_SERVICE,
  CAR_ROUTES,
  CAR_API,
  CAR_PAGE,
  CA_HOME,
  DRIVER_SECTION,
  DRIVER_PROFILE,
  SETTLEMENTS_SECTION,
  SETTLEMENTS_PAGE,
  SETTLEMENT_DETAIL,
  SETTLEMENT_FINANCE_SECTION,
  LIABILITIES_HOME,
  MATRIX,
];
const LABEL = "verify-driver-cash-advances-settlement-modal-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertSettlementsClusterReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const carService = src[CAR_SERVICE];
  const carRoutes = src[CAR_ROUTES];
  const carApi = src[CAR_API];
  const carPage = src[CAR_PAGE];
  const caHome = src[CA_HOME];
  const driverSection = src[DRIVER_SECTION];
  const driverProfile = src[DRIVER_PROFILE];
  const settlementsSection = src[SETTLEMENTS_SECTION];
  const settlementsPage = src[SETTLEMENTS_PAGE];
  const settlementDetail = src[SETTLEMENT_DETAIL];
  const settlementFinanceSection = src[SETTLEMENT_FINANCE_SECTION];
  const liabilitiesHome = src[LIABILITIES_HOME];
  try {
    const matrix = JSON.parse(src[MATRIX]);
    for (const id of CLAIMED_LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) problems.push(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`);
    }
  } catch {
    problems.push(`${MATRIX}: settlements Required matrix must parse`);
  }

  // -- cash_advances (new build) --
  if (!/AND r\.driver_id = \$/.test(carService)) {
    problems.push(`${CAR_SERVICE}: listPendingCashAdvanceRequests must filter by driver_id server-side when provided`);
  }
  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(carRoutes)) {
    problems.push(`${CAR_ROUTES}: pendingQuerySchema must accept optional driver_id`);
  }
  if (!/driverId:\s*parsed\.data\.driver_id/.test(carRoutes)) {
    problems.push(`${CAR_ROUTES}: pending route must forward driver_id to listPendingCashAdvanceRequests`);
  }
  if (!/listPending\(operatingCompanyId: string, driverId\?: string\)/.test(carApi)) {
    problems.push(`${CAR_API}: listPending must accept an optional driverId param`);
  }
  if (!/searchParams\.get\("driver_id"\)/.test(carPage)) {
    problems.push(`${CAR_PAGE}: must read driver_id from URL search params`);
  }
  if (!/listPending\(companyId,\s*(deepLinkDriverId\s*\?\?\s*undefined|effectiveDriverId)\)/.test(carPage)) {
    problems.push(`${CAR_PAGE}: must forward deepLinkDriverId/effectiveDriverId to listPending`);
  }
  if (
    !/dataTestId="cash-advance-requests-filter-driver"/.test(carPage) ||
    !/allowCreate=\{false\}/.test(carPage)
  ) {
    problems.push(`${CAR_PAGE}: must render EntityPicker driver filter (allowCreate=false)`);
  }

  // -- drawer.advance_detail / modal.mark_disbursed (pre-existing backend, missing FE wrapping) --
  if (!/driverIdFilter\s*=\s*searchParams\.get\("driver_id"\)/.test(caHome)) {
    problems.push(`${CA_HOME}: must read driver_id from URL search params (pre-existing contract)`);
  }
  if (
    !/dataTestId="cash-advances-filter-driver"/.test(caHome) ||
    !/kind=["']driver["']/.test(caHome) ||
    !/allowCreate=\{false\}/.test(caHome)
  ) {
    problems.push(`${CA_HOME}: must render EntityPicker kind=driver filter (allowCreate=false)`);
  }
  if (!/onMarkDisbursed=\{\(\)\s*=>\s*setMarkDisbursedOpen\(true\)\}/.test(caHome)) {
    problems.push(`${CA_HOME}: AdvanceDetailDrawer must wire onMarkDisbursed to MarkDisbursedModal (pre-existing contract)`);
  }

  // -- new reverse section --
  if (!/listPending\(operatingCompanyId,\s*driverId\)/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: must query pending requests scoped to driverId`);
  }
  if (!/listCashAdvances\(operatingCompanyId,\s*\{\s*driver_id:\s*driverId\s*\}\)/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: must query cash advances scoped to driverId`);
  }
  if (!/kind="cash_advance"/.test(driverSection)) {
    problems.push(`${DRIVER_SECTION}: disbursed advance rows must EntityLink kind=cash_advance`);
  }
  if (!/import\s*\{\s*DriverCashAdvancesReverseSection\s*\}/.test(driverProfile)) {
    problems.push(`${DRIVER_PROFILE}: must import DriverCashAdvancesReverseSection`);
  }
  if (!/<DriverCashAdvancesReverseSection[\s\S]*?driverId=\{id\}/.test(driverProfile)) {
    problems.push(`${DRIVER_PROFILE}: must mount <DriverCashAdvancesReverseSection driverId={id} .../>`);
  }

  // -- modal.hold_deduction / modal.liability_breakdown / panel.pay_run_close (pin pre-existing chain) --
  if (!/kind="settlement"/.test(settlementsSection)) {
    problems.push(`${SETTLEMENTS_SECTION}: weekly settlement rows must EntityLink kind=settlement (pre-existing chain start)`);
  }
  if (!/<SettlementsSection/.test(driverProfile)) {
    problems.push(`${DRIVER_PROFILE}: must mount <SettlementsSection ... /> (pre-existing chain start)`);
  }
  if (!/selectedSettlementId\s*=\s*searchParams\.get\("settlement_id"\)/.test(settlementsPage)) {
    problems.push(`${SETTLEMENTS_PAGE}: must read settlement_id and render SettlementDetailPage (pre-existing chain)`);
  }
  if (!/<SettlementDetailPage \/>/.test(settlementsPage)) {
    problems.push(`${SETTLEMENTS_PAGE}: must render <SettlementDetailPage /> on settlement_id (pre-existing chain)`);
  }
  if (!/import \{ PayRunClosePanel \}/.test(settlementDetail) || !/<PayRunClosePanel/.test(settlementDetail)) {
    problems.push(`${SETTLEMENT_DETAIL}: must import and mount PayRunClosePanel (pre-existing chain)`);
  }
  if (!/import \{ LiabilityBreakdownModal \}/.test(settlementDetail) || !/<LiabilityBreakdownModal/.test(settlementDetail)) {
    problems.push(`${SETTLEMENT_DETAIL}: must import and mount LiabilityBreakdownModal (pre-existing chain)`);
  }
  if (!/import \{ HoldDeductionModal \}/.test(settlementDetail) || !/<HoldDeductionModal/.test(settlementDetail)) {
    problems.push(`${SETTLEMENT_DETAIL}: must import and mount HoldDeductionModal (pre-existing chain)`);
  }

  // -- settlements:drawer.liability_detail (pin pre-existing chain, #6740) --
  if (!/kind="liability"/.test(settlementFinanceSection)) {
    problems.push(`${SETTLEMENT_FINANCE_SECTION}: liability rows must EntityLink kind=liability (pre-existing chain, #6740)`);
  }
  if (!/deepLinkLiabilityId\s*=\s*searchParams\.get\("liability_id"\)/.test(liabilitiesHome)) {
    problems.push(`${LIABILITIES_HOME}: must read liability_id from URL search params (pre-existing chain)`);
  }
  if (!/setSelectedLiabilityId\(deepLinkLiabilityId\)/.test(liabilitiesHome) || !/setDetailOpen\(true\)/.test(liabilitiesHome)) {
    problems.push(`${LIABILITIES_HOME}: must open LiabilityDetailDrawer on deepLinkLiabilityId (pre-existing chain)`);
  }
  if (
    !/driverIdFilter\s*=\s*searchParams\.get\("driver_id"\)/.test(liabilitiesHome) ||
    !/dataTestId="liabilities-filter-driver"/.test(liabilitiesHome) ||
    !/allowCreate=\{false\}/.test(liabilitiesHome)
  ) {
    problems.push(`${LIABILITIES_HOME}: must render EntityPicker kind=driver filter (allowCreate=false) and honor ?driver_id=`);
  }

  return problems;
}

function selftest() {
  const good = {
    [CAR_SERVICE]: `
      let where = \`r.operating_company_id = $1::uuid AND r.status IN ('pending', 'under_review')\`;
      if (filter.driverId) {
        args.push(filter.driverId);
        where += \` AND r.driver_id = $\${args.length}::uuid\`;
      }
    `,
    [CAR_ROUTES]: `
      const pendingQuerySchema = companyQuerySchema.extend({
        driver_id: z.string().uuid().optional(),
      });
      return listPendingCashAdvanceRequests(client, parsed.data.operating_company_id, {
        driverId: parsed.data.driver_id,
      });
    `,
    [CAR_API]: `
      listPending(operatingCompanyId: string, driverId?: string) {
        return apiRequest(withCompanyQuery("/api/v1/driver-finance/cash-advance-requests/pending", operatingCompanyId, driverId ? { driver_id: driverId } : {}));
      },
    `,
    [CAR_PAGE]: `
      const deepLinkDriverId = searchParams.get("driver_id");
      const pendingQuery = useQuery({
        queryFn: () => cashAdvanceRequestsOfficeApi.listPending(companyId, effectiveDriverId),
      });
      dataTestId="cash-advance-requests-filter-driver"
      allowCreate={false}
    `,
    [CA_HOME]: `
      const driverIdFilter = searchParams.get("driver_id");
      dataTestId="cash-advances-filter-driver"
      kind="driver"
      allowCreate={false}
      <AdvanceDetailDrawer onMarkDisbursed={() => setMarkDisbursedOpen(true)} />
    `,
    [DRIVER_SECTION]: `
      cashAdvanceRequestsOfficeApi.listPending(operatingCompanyId, driverId)
      listCashAdvances(operatingCompanyId, { driver_id: driverId }).then((r) => r.advances)
      kind="cash_advance"
    `,
    [DRIVER_PROFILE]: `
      import { DriverCashAdvancesReverseSection } from "../../components/driver-profile/DriverCashAdvancesReverseSection";
      <SettlementsSection settlements={aggregate.settlements ?? {}} driverId={id} />
      <DriverCashAdvancesReverseSection operatingCompanyId={companyId} driverId={id} />
    `,
    [SETTLEMENTS_SECTION]: `kind="settlement"`,
    [SETTLEMENTS_PAGE]: `
      const selectedSettlementId = searchParams.get("settlement_id");
      if (selectedSettlementId && activeTab === "settlements") {
        return <SettlementDetailPage />;
      }
    `,
    [SETTLEMENT_DETAIL]: `
      import { PayRunClosePanel } from "./components/PayRunClosePanel";
      import { LiabilityBreakdownModal } from "./components/LiabilityBreakdownModal";
      import { HoldDeductionModal } from "./components/HoldDeductionModal";
      <PayRunClosePanel settlementId={settlementId} />
      <LiabilityBreakdownModal open={liabilityOpen} settlementId={settlementId} />
      <HoldDeductionModal open={Boolean(holdTarget)} settlementId={settlementId} />
    `,
    [SETTLEMENT_FINANCE_SECTION]: `kind="liability"`,
    [LIABILITIES_HOME]: `
      const deepLinkLiabilityId = searchParams.get("liability_id");
      const driverIdFilter = searchParams.get("driver_id");
      dataTestId="liabilities-filter-driver"
      allowCreate={false}
      useEffect(() => {
        if (!deepLinkLiabilityId) return;
        setSelectedLiabilityId(deepLinkLiabilityId);
        setDetailOpen(true);
      }, [deepLinkLiabilityId]);
    `,
    [MATRIX]: JSON.stringify({ leaves: CLAIMED_LEAVES.map((id) => ({ id, required: ["reverse_link"] })) }),
  };
  const goodProblems = assertSettlementsClusterReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [CAR_SERVICE]: good[CAR_SERVICE].replace("where += ` AND r.driver_id = $${args.length}::uuid`;", "") },
    { ...good, [CAR_ROUTES]: good[CAR_ROUTES].replace("driver_id: z.string().uuid().optional(),\n      });", "});") },
    { ...good, [CAR_ROUTES]: good[CAR_ROUTES].replace("driverId: parsed.data.driver_id,", "") },
    { ...good, [CAR_API]: good[CAR_API].replace("driverId?: string", "") },
    { ...good, [CAR_PAGE]: good[CAR_PAGE].replace('searchParams.get("driver_id")', '""') },
    { ...good, [CAR_PAGE]: good[CAR_PAGE].replace("listPending(companyId, effectiveDriverId)", "listPending(companyId)") },
    { ...good, [CAR_PAGE]: good[CAR_PAGE].replace('dataTestId="cash-advance-requests-filter-driver"', 'dataTestId="x"') },
    { ...good, [CA_HOME]: good[CA_HOME].replace('searchParams.get("driver_id")', '""') },
    { ...good, [CA_HOME]: good[CA_HOME].replace('dataTestId="cash-advances-filter-driver"', 'dataTestId="x"') },
    { ...good, [CA_HOME]: good[CA_HOME].replace("onMarkDisbursed={() => setMarkDisbursedOpen(true)}", "") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace("cashAdvanceRequestsOfficeApi.listPending(operatingCompanyId, driverId)", "") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace("{ driver_id: driverId }", "{}") },
    { ...good, [DRIVER_SECTION]: good[DRIVER_SECTION].replace('kind="cash_advance"', "") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("import { DriverCashAdvancesReverseSection }", "// removed") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("<DriverCashAdvancesReverseSection operatingCompanyId={companyId} driverId={id} />", "") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("<SettlementsSection settlements={aggregate.settlements ?? {}} driverId={id} />", "") },
    { ...good, [SETTLEMENTS_SECTION]: good[SETTLEMENTS_SECTION].replace('kind="settlement"', "") },
    { ...good, [SETTLEMENTS_PAGE]: good[SETTLEMENTS_PAGE].replace('searchParams.get("settlement_id")', '""') },
    { ...good, [SETTLEMENTS_PAGE]: good[SETTLEMENTS_PAGE].replace("<SettlementDetailPage />", "null") },
    { ...good, [SETTLEMENT_DETAIL]: good[SETTLEMENT_DETAIL].replace("import { PayRunClosePanel }", "// removed") },
    { ...good, [SETTLEMENT_DETAIL]: good[SETTLEMENT_DETAIL].replace("<PayRunClosePanel settlementId={settlementId} />", "") },
    { ...good, [SETTLEMENT_DETAIL]: good[SETTLEMENT_DETAIL].replace("import { LiabilityBreakdownModal }", "// removed") },
    { ...good, [SETTLEMENT_DETAIL]: good[SETTLEMENT_DETAIL].replace("import { HoldDeductionModal }", "// removed") },
    { ...good, [SETTLEMENT_FINANCE_SECTION]: good[SETTLEMENT_FINANCE_SECTION].replace('kind="liability"', "") },
    { ...good, [LIABILITIES_HOME]: good[LIABILITIES_HOME].replace('searchParams.get("liability_id")', '""') },
    { ...good, [LIABILITIES_HOME]: good[LIABILITIES_HOME].replace('dataTestId="liabilities-filter-driver"', 'dataTestId="x"') },
    { ...good, [LIABILITIES_HOME]: good[LIABILITIES_HOME].replace("setSelectedLiabilityId(deepLinkLiabilityId);", "") },
    { ...good, [LIABILITIES_HOME]: good[LIABILITIES_HOME].replace("setDetailOpen(true);\n      }, [deepLinkLiabilityId]);", "}, [deepLinkLiabilityId]);") },
    ...CLAIMED_LEAVES.map((id) => ({ ...good, [MATRIX]: good[MATRIX].replace(`"id":"${id}"`, `"id":"${id}.removed"`) })),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertSettlementsClusterReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertSettlementsClusterReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
