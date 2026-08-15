#!/usr/bin/env node
/** LST-F136 — Dispatch inline pickers / claim create / load banking / revenue drill / bank item human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/parity/EntityPicker.tsx",
  "apps/frontend/src/components/dispatch/InlineUnitPicker.tsx",
  "apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx",
  "apps/frontend/src/components/dispatch/InlineDriverPicker.tsx",
  "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx",
  "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
  "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  "apps/frontend/src/components/home/RevenueDiscrepancyDrill.tsx",
  "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
  "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
];
const LABEL = "verify-dispatch-inline-claim-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
  }
  const picker = srcs["apps/frontend/src/components/parity/EntityPicker.tsx"];
  if (!/onChange:\s*\(value: string \| null, option\?: EntityPickerOption \| null\)/.test(picker)) {
    problems.push("EntityPicker: onChange must return the selected canonical option with its FK");
  }
  if (!/onChange\(next, next \? options\.find\(\(option\) => option\.value === next\) \?\? null : null\)/.test(picker)) {
    problems.push("EntityPicker: roster selection must return the matching human-labelled option");
  }
  for (const [file, noun] of [
    ["apps/frontend/src/components/dispatch/InlineUnitPicker.tsx", "Unit"],
    ["apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx", "Trailer"],
    ["apps/frontend/src/components/dispatch/InlineDriverPicker.tsx", "Driver"],
  ]) {
    const src = srcs[file];
    if (!/onChange=\{async \(next, option\) =>/.test(src) || !/const label = option\?\.label/.test(src)) {
      problems.push(`${file}: inline ${noun.toLowerCase()} assignment must consume the selected roster label`);
    }
    if (new RegExp(`entityLabel\\(null,\\s*next,\\s*"${noun}"\\)`).test(src)) {
      problems.push(`${file}: inline ${noun.toLowerCase()} assignment rebuilds its label from the UUID`);
    }
  }
  const assign = srcs["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx"];
  if (!assign.includes('userFacingApiError(activeQuery.error, "Could not load available drivers")')) {
    problems.push("AssignDriverDropdown: active load/roster query failure must use operator-safe copy");
  }
  if (!assign.includes("onRetry={() => void activeQuery.refetch()}")) {
    problems.push("AssignDriverDropdown: active load/roster query failure must be retryable");
  }
  if (!assign.includes("activeQuery.isLoading")) {
    problems.push("AssignDriverDropdown: pre-create roster loading state must drive the picker");
  }
  if (!/label:\s*d\.hos_safe \? d\.display_name : `\$\{d\.display_name\}/.test(assign)) {
    problems.push("AssignDriverDropdown: roster options must consume canonical driver display names");
  }
  const claim = srcs["apps/frontend/src/components/insurance/ClaimCreateModal.tsx"];
  for (const kind of ["insurance_policy", "unit", "load", "trailer"]) {
    if (!new RegExp(`<EntityPicker[\\s\\S]{0,180}?kind="${kind}"[\\s\\S]{0,220}?operatingCompanyId=\\{operatingCompanyId\\}`).test(claim)) {
      problems.push(`ClaimCreateModal: ${kind} must use the company-scoped canonical EntityPicker`);
    }
  }
  if (!/<DriverPickerWithCreate[\s\S]{0,180}?operatingCompanyId=\{operatingCompanyId\}/.test(claim)) {
    problems.push("ClaimCreateModal: driver must use the company-scoped canonical creator/picker");
  }
  if (!/label: `Accident — \$\{when\}`/.test(claim) || !/options=\{accidentOptions\}/.test(claim)) {
    problems.push("ClaimCreateModal: accident selector must render the human accident-date label");
  }
  const exactConsumers = [
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", /entityLabel\(null, id, "Load"\)/, "load breadcrumb"],
    ["apps/frontend/src/components/home/RevenueDiscrepancyDrill.tsx", /entityLabel\(inv\.display_id, inv\.invoice_id, "Invoice"\)/, "invoice display ID"],
    ["apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx", /entityLabel\(selectedPending\.driver_name, selectedPending\.driver_id, "Driver"\)/, "deduction driver name"],
    ["apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx", /entityLabel\(currentLoad\.load_number, currentLoad\.load_id, "Load"\)/, "current load number"],
    ["apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", /entityLabel\(tx\.categorization_load_number, tx\.categorization_load_id \|\| tx\.matched_load_id, "Load"\)/, "bank load number"],
  ];
  for (const [file, pattern, label] of exactConsumers) {
    if (!pattern.test(srcs[file])) problems.push(`${file}: missing exact ${label} consumer`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    ["apps/frontend/src/components/parity/EntityPicker.tsx", "onChange(next, next ? options.find((option) => option.value === next) ?? null : null)", "onChange(next)", "picker option return"],
    ["apps/frontend/src/components/dispatch/InlineUnitPicker.tsx", "const label = option?.label", "const label = next.slice(0, 8) || option?.label", "unit roster label"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", "onRetry={() => void activeQuery.refetch()}", "", "driver retry"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", 'userFacingApiError(activeQuery.error, "Could not load available drivers")', 'String(activeQuery.error)', "safe driver error"],
    ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", 'kind="insurance_policy"', 'kind="load"', "claim policy picker"],
    ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", 'label: `Accident — ${when}`', 'label: value', "claim accident label"],
  ];
  for (const [file, needle, replacement, label] of mutations) {
    const planted = { ...srcs, [file]: srcs[file].replace(needle, replacement) };
    if (planted[file] === srcs[file] || !assertAll(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted ${label} defect not caught`);
      process.exit(1);
    }
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
