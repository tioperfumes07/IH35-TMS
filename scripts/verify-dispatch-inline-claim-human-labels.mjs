#!/usr/bin/env node
/** LST-F136 — Dispatch inline pickers / claim create / load banking / revenue drill / bank item human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/parity/EntityPicker.tsx",
  "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
  "apps/frontend/src/components/fleet/CreateUnitModal.tsx",
  "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
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
  const creatorContracts = [
    ["apps/frontend/src/components/drivers/CreateDriverModal.tsx", /onCreated\?: \(driverId: string, displayName: string\)/, /onCreated\(created\.id, displayName\)/, "driver"],
    ["apps/frontend/src/components/fleet/CreateUnitModal.tsx", /onCreated\?: \(unitId: string, displayName: string\)/, /onCreated\?\.\(String\(created\.id\), submission\.draft\.unit_number\.trim\(\)\)/, "unit"],
    ["apps/frontend/src/components/fleet/CreateTrailerModal.tsx", /onCreated\?: \(equipmentId: string, displayName: string\)/, /onCreated\?\.\(String\(created\.id\), input\.draft\.equipment_number\.trim\(\)\)/, "trailer"],
  ];
  for (const [file, signature, callback, noun] of creatorContracts) {
    if (!signature.test(srcs[file]) || !callback.test(srcs[file])) {
      problems.push(`${file}: canonical ${noun} creator must return id plus its human display label`);
    }
  }
  if ((picker.match(/onCreated=\{\(id, label\) => handleCreated\(id, label\)\}/g) ?? []).length !== 3) {
    problems.push("EntityPicker: driver, unit, and trailer creators must each preserve the returned human label");
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
  if (!assign.includes('import { entityLabel } from "../../lib/entity-label"')) {
    problems.push("AssignDriverDropdown: pre-create roster must use the shared honest-label contract");
  }
  if (!/display_name:\s*entityLabel\(\[d\.first_name, d\.last_name\]\.filter\(Boolean\)\.join\(" "\)\.trim\(\), d\.id, "Driver"\)/.test(assign)) {
    problems.push("AssignDriverDropdown: nameless pre-create drivers must not fall back to a raw UUID");
  }
  if (/display_name:[^\n]*\|\|\s*d\.id/.test(assign)) {
    problems.push("AssignDriverDropdown: raw driver UUID remains a visible label fallback");
  }
  if (!assign.includes('userFacingApiError(activeQuery.error, "Could not load available drivers")')) {
    problems.push("AssignDriverDropdown: active load/roster query failure must use operator-safe copy");
  }
  if (!assign.includes("onRetry={() => void activeQuery.refetch()}")) {
    problems.push("AssignDriverDropdown: active load/roster query failure must be retryable");
  }
  if (!assign.includes("activeQuery.isLoading")) {
    problems.push("AssignDriverDropdown: pre-create roster loading state must drive the picker");
  }
  if (!assign.includes("activeQuery.isLoading || activeQuery.isError")) {
    problems.push("AssignDriverDropdown: active load/roster failure must disable selection and nested create");
  }
  if (!/label:\s*d\.hos_safe \? d\.display_name : `\$\{d\.display_name\}/.test(assign)) {
    problems.push("AssignDriverDropdown: roster options must consume canonical driver display names");
  }
  if (!/onCreated=\{\(createdId, displayName\) =>[\s\S]{0,160}?display_name: displayName/.test(assign)) {
    problems.push("AssignDriverDropdown: a newly created driver must retain the creator's human label");
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
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", /getLoad\(id as string, companyId\)/, "company-scoped load label read"],
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", /entityLabel\(loadNumber, id, "Load"\)/, "load breadcrumb"],
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", /<EntityLinkOrTombstone[\s\S]{0,180}?kind="load"[\s\S]{0,180}?name=\{loadNumber\}/, "load-number reverse drill"],
    ["apps/frontend/src/components/home/RevenueDiscrepancyDrill.tsx", /entityLabel\(inv\.display_id, inv\.invoice_id, "Invoice"\)/, "invoice display ID"],
    ["apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx", /EntityLinkOrTombstone kind="driver" id=\{selectedPending\.driver_id\} name=\{selectedPending\.driver_name\}/, "unresolved-safe deduction driver name"],
    ["apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx", /EntityLinkOrTombstone kind="load" id=\{String\(currentLoad\.load_id\)\} name=\{currentLoad\.load_number\}/, "unresolved-safe current load number"],
  ];
  for (const [file, pattern, label] of exactConsumers) {
    if (!pattern.test(srcs[file])) problems.push(`${file}: missing exact ${label} consumer`);
  }
  const banking = srcs["apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx"];
  if ((banking.match(/entityLabel\(tx\.resolved_load_number, tx\.resolved_load_id, "Load"\)/g) ?? []).length !== 2) {
    problems.push("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx: missing exact bank load number consumers");
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const mutations = [
    ["apps/frontend/src/components/parity/EntityPicker.tsx", "onChange(next, next ? options.find((option) => option.value === next) ?? null : null)", "onChange(next)", "picker option return"],
    ["apps/frontend/src/components/drivers/CreateDriverModal.tsx", "onCreated(created.id, displayName)", "onCreated(created.id)", "created driver label"],
    ["apps/frontend/src/components/fleet/CreateUnitModal.tsx", "onCreated?.(String(created.id), submission.draft.unit_number.trim())", "onCreated?.(String(created.id))", "created unit label"],
    ["apps/frontend/src/components/fleet/CreateTrailerModal.tsx", "onCreated?.(String(created.id), input.draft.equipment_number.trim())", "onCreated?.(String(created.id))", "created trailer label"],
    ["apps/frontend/src/components/dispatch/InlineUnitPicker.tsx", "const label = option?.label", "const label = next.slice(0, 8) || option?.label", "unit roster label"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", "onRetry={() => void activeQuery.refetch()}", "", "driver retry"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", 'userFacingApiError(activeQuery.error, "Could not load available drivers")', 'String(activeQuery.error)', "safe driver error"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", "activeQuery.isLoading || activeQuery.isError", "activeQuery.isLoading", "driver picker failure fail closed"],
    ["apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx", 'entityLabel([d.first_name, d.last_name].filter(Boolean).join(" ").trim(), d.id, "Driver")', '[d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.id', "raw driver UUID fallback"],
    ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", 'kind="insurance_policy"', 'kind="load"', "claim policy picker"],
    ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", 'label: `Accident — ${when}`', 'label: value', "claim accident label"],
    ["apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx", 'name={selectedPending.driver_name}', 'name={null}', "deduction driver human label"],
    ["apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx", 'name={currentLoad.load_number}', 'name={null}', "current load human label"],
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", 'getLoad(id as string, companyId)', 'getLoad(id as string)', "load label company scope"],
    ["apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx", 'name={loadNumber}', 'name={null}', "load banking reverse label"],
    ["apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", 'entityLabel(tx.resolved_load_number, tx.resolved_load_id, "Load")', 'entityLabel(null, tx.resolved_load_id, "Load")', "bank resolved load number"],
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
