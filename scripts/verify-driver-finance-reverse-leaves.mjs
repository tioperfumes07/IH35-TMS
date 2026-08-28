#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["cash_advances","deductions","disputes","drivers.panel.pending_settlement_deductions"],"task":"CLASS-F5878-DRIVER-DEDUCTION-PANELS-REVERSE-EXACT-LEAVES","vertical":"class-sweep"} */
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["escrow_record.list"],"task":"CLASS-F5876-DRIVER-FINANCE-REVERSE-EXACT-LEAVES","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-driver-finance-reverse-leaves";
const files = {
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  deductions: "apps/frontend/src/pages/drivers/PendingSettlementDeductionsPanel.tsx",
  disputes: "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx",
  disputeHook: "apps/frontend/src/hooks/useSettlementDisputes.ts",
  banking: "apps/frontend/src/pages/banking/components/DriverEscrowTabContent.tsx",
  safety: "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx",
  driversMatrix: "docs/specs/scoreboard/modules/drivers.required.json",
  safetyMatrix: "docs/specs/scoreboard/modules/safety.required.json",
  self: "scripts/verify-driver-finance-reverse-leaves.mjs",
};
const REQUIRED = { driversMatrix: ["cash_advances", "deductions", "disputes", "drivers.panel.pending_settlement_deductions"], safetyMatrix: ["escrow_record.list"] };
const HEADERS = [
  '/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["cash_advances","deductions","disputes","drivers.panel.pending_settlement_deductions"],"task":"CLASS-F5878-DRIVER-DEDUCTION-PANELS-REVERSE-EXACT-LEAVES","vertical":"class-sweep"} */',
  '/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leaves":["escrow_record.list"],"task":"CLASS-F5876-DRIVER-FINANCE-REVERSE-EXACT-LEAVES","vertical":"class-sweep"} */',
];
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  // The driver drill is defined in debtAlertColumns and consumed by the cash-advance
  // ParityTable. Keep these as separate structural assertions: a proximity window from
  // the tab branch to the column renderer breaks whenever harmless table chrome grows.
  // DRV-MONEY-F7034 — the tab branch grew a debt-loading error state (DRV-MONEY-F6110) that
  // pushed this gap from ~1200 to 1306 chars with the wiring still fully intact; this guard's
  // own comment predicted exactly this failure mode. Widened with headroom for further chrome
  // growth — the "advance-tab-binding" selftest mutation below still catches a real disconnect
  // (it removes the "cash_advances" literal entirely, which fails at any window size).
  if (
    !/cashAdvanceRequestsOfficeApi\.list\(selectedCompanyId!\)/.test(s.drivers) ||
    !/subnavTab === "cash_advances"[\s\S]{0,2000}columns=\{debtAlertColumns\}/.test(s.drivers) ||
    !/const debtAlertColumns:[\s\S]{0,700}<EntityLink kind="driver"/.test(s.drivers)
  ) {
    failures.push("cash-advance driver reverse/scope missing");
  }
  if (!/listSettlementDeductions\(selectedCompanyId!/.test(s.deductions) || !/<EntityLink kind="driver" id=\{row\.driver_id\}/.test(s.deductions)) failures.push("deduction driver reverse/scope missing");
  if (!/query\.isError/.test(s.deductions) || !/No pending settlement deductions\./.test(s.deductions)) failures.push("deduction honest states missing");
  // LST-F5163M + LST-F5187: CappedListNotice promised a driver filter — URL-only / local-only is not enough.
  if (
    !/dataTestId="settlement-deductions-filter-driver"/.test(s.deductions) ||
    !/allowCreate=\{false\}/.test(s.deductions) ||
    !/setDriverFilter/.test(s.deductions) ||
    !/setSearchParams/.test(s.deductions)
  ) {
    failures.push("deduction list EntityPicker driver filter missing URL sync");
  }
  if (!/operating_company_id: companyId/.test(s.disputeHook) || !/isError: listQuery\.isError/.test(s.disputeHook) || !/isSuccess: listQuery\.isSuccess/.test(s.disputeHook)) failures.push("dispute scope/status contract missing");
  if (!/<EntityLink[\s\S]{0,100}kind="driver"[\s\S]{0,100}id=\{row\.driver_id\}/.test(s.disputes) || !/<EntityLink[\s\S]{0,100}kind="settlement"/.test(s.disputes)) failures.push("dispute canonical drills missing");
  if (!/Could not load settlement disputes\./.test(s.disputes) || !/No settlement disputes found\./.test(s.disputes)) failures.push("dispute honest states missing");
  if (!/getEscrowDriverBalances\(operatingCompanyId\)/.test(s.banking) || !/navigate\([^\n]*rowDriverId/.test(s.banking)) failures.push("bank escrow driver reverse/scope missing");
  if (!/listState\.isError/.test(s.banking) || !/No escrow ledger rows found for this filter\./.test(s.banking)) failures.push("bank escrow honest states missing");
  if (!/listEscrowRecords\(operatingCompanyId\)/.test(s.safety) || !/<EntityLink[\s\S]{0,100}kind="driver"[\s\S]{0,100}id=\{row\.id \|\| null\}/.test(s.safety)) failures.push("safety escrow driver reverse/scope missing");
  if (!/escrowQuery\.isError/.test(s.safety) || !/No escrow records available for the selected company\./.test(s.safety)) failures.push("safety escrow honest states missing");
  // LST-F5163K: list chrome reverse (URL-only open-drawer is not a visible filter).
  if (!/dataTestId="escrow-records-filter-driver"/.test(s.safety) || !/allowCreate=\{false\}/.test(s.safety) || !/setDriverFilter/.test(s.safety)) {
    failures.push("safety escrow list EntityPicker driver filter missing");
  }
  for (const [key, ids] of Object.entries(REQUIRED)) {
    try {
      const matrix = JSON.parse(s[key]);
      for (const id of ids) if (!matrix.leaves?.find((leaf) => leaf.id === id)?.required?.includes("reverse_link")) failures.push(`${key}:${id} must require reverse_link`);
    } catch { failures.push(`${key} must parse`); }
  }
  for (const header of HEADERS) if (!s.self.split("\n").includes(header)) failures.push(`exact Built header missing: ${header}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["advance-drill", "drivers", /kind="driver"/g, 'kind="vendor"'],
    ["advance-scope", "drivers", /cashAdvanceRequestsOfficeApi\.list\(selectedCompanyId!\)/g, "cashAdvanceRequestsOfficeApi.list('')"],
    ["advance-table-binding", "drivers", /columns=\{debtAlertColumns\}/g, "columns={[]}"],
    ["advance-tab-binding", "drivers", /subnavTab === "cash_advances"/g, 'subnavTab === "removed"'],
    ["deduction-drill", "deductions", /kind="driver"/g, 'kind="vendor"'],
    ["deduction-scope", "deductions", /listSettlementDeductions\(selectedCompanyId!/g, "listSettlementDeductions(undefined!"],
    ["deduction-error", "deductions", /query\.isError/g, "false"],
    ["deduction-state", "deductions", /No pending settlement deductions\./g, "Loading"],
    ["deduction-list-filter", "deductions", /dataTestId="settlement-deductions-filter-driver"/g, 'dataTestId="x"'],
    ["deduction-filter-no-create", "deductions", /allowCreate=\{false\}/g, "allowCreate"],
    ["deduction-filter-state", "deductions", /setDriverFilter/g, "dropDriverFilter"],
    // The replacement must NOT contain "setSearchParams" as a substring — "setSearchParamsNOPE"
    // still matches /setSearchParams/, so the check's .test() stayed true and this mutation was a
    // silent no-op against its own audit() clause. Found live: this mutation never actually
    // changed what the guard detects.
    ["deduction-url-write", "deductions", /setSearchParams/g, "handleUrlSync"],
    ["dispute-scope", "disputeHook", /operating_company_id: companyId/g, "operating_company_id: ''"],
    ["dispute-error-contract", "disputeHook", /isError: listQuery\.isError/g, "isError: false"],
    ["dispute-success-contract", "disputeHook", /isSuccess: listQuery\.isSuccess/g, "isSuccess: false"],
    ["dispute-state", "disputes", /Could not load settlement disputes\./g, "Loading"],
    ["dispute-empty", "disputes", /No settlement disputes found\./g, "No rows"],
    ["dispute-driver-drill", "disputes", /kind="driver"/g, 'kind="vendor"'],
    ["dispute-drill", "disputes", /kind="settlement"/g, 'kind="driver"'],
    ["bank-route", "banking", /navigate\([^\n]*rowDriverId[^\n]*\)/g, "navigate('/drivers')"],
    ["bank-scope", "banking", /getEscrowDriverBalances\(operatingCompanyId\)/g, "getEscrowDriverBalances('')"],
    ["bank-error", "banking", /listState\.isError/g, "false"],
    ["bank-state", "banking", /No escrow ledger rows found for this filter\./g, "Loading"],
    ["safety-driver-kind", "safety", /kind="driver"/g, 'kind="vendor"'],
    ["safety-drill", "safety", /id=\{row\.id \|\| null\}/g, "id={null}"],
    ["safety-scope", "safety", /listEscrowRecords\(operatingCompanyId\)/g, "listEscrowRecords('')"],
    ["safety-error", "safety", /escrowQuery\.isError/g, "false"],
    ["safety-empty", "safety", /No escrow records available for the selected company\./g, "No rows"],
    ["safety-list-filter", "safety", /dataTestId="escrow-records-filter-driver"/g, 'dataTestId="x"'],
    ["safety-filter-no-create", "safety", /allowCreate=\{false\}/g, "allowCreate"],
    ["safety-filter-state", "safety", /setDriverFilter/g, "dropDriverFilter"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) {
      console.error(LABEL + " SELFTEST FAIL — " + name);
      process.exit(1);
    }
  }
  let caught = mutations.length;
  for (const [key, ids] of Object.entries(REQUIRED)) for (const id of ids) {
    const candidate = { ...source, [key]: source[key].replace(`"id": "${id}"`, `"id": "${id}.removed"`) };
    if (!audit(candidate).some((failure) => failure.includes(`${key}:${id}`))) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${key}:${id}`);
      process.exit(1);
    }
    caught++;
  }
  for (const header of HEADERS) {
    const candidate = { ...source, self: source.self.replace(header, `${header}.removed`) };
    if (!audit(candidate).some((failure) => failure.includes("exact Built header missing"))) {
      console.error(`${LABEL} SELFTEST FAIL — header mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${mutations.length + 7} production/evidence mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(LABEL + " FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(LABEL + " PASS — driver finance reverse leaves are company-scoped, canonical, and honest");
