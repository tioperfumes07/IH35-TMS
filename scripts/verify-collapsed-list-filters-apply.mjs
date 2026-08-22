#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","customers","dispatch","docs","drivers","finance","fleet","insurance","legal","lists","maintenance","reports","safety","settlements","vendors"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_(search|range|gear)$","task":"CLS-FILTER-GEAR-APPLY","vertical":"class-sweep"} */
/** @matrix-built {"modules":["lists","customers","docs","factoring","fleet","maintenance","tasks","vendors"],"cols":["connectivity","qbo_chrome"],"leaves":["chrome.toolbar_filter"],"task":"CLASS-F5952-TOOLBAR-FILTER-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const ALLOWED_EXEMPT = "pages/accounting/IntegrationTransactionsPage.tsx";
const ALLOWED_LOCAL_DRAFT = new Map([
  ["pages/dispatch/TripProfitability.tsx", new Set(["setPeriod"])],
]);
const INVENTORY = "scripts/collapsed-list-filters-apply-inventory.json";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const SELF = "scripts/verify-collapsed-list-filters-apply.mjs";
const FILTER_EXACT_HEADER = '/** @matrix-built {"modules":["lists","customers","docs","factoring","fleet","maintenance","tasks","vendors"],"cols":["connectivity","qbo_chrome"],"leaves":["chrome.toolbar_filter"],"task":"CLASS-F5952-TOOLBAR-FILTER-EXACT","vertical":"class-sweep"} */';

function auditExactHeader(source) {
  return source.split("\n").includes(FILTER_EXACT_HEADER) ? [] : ["exact eight-module toolbar-filter Built header missing"];
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) out.push(abs);
  }
  return out;
}

export function audit(sources) {
  const failures = [];
  let consumers = 0;
  let exempt = 0;
  for (const [rel, source] of Object.entries(sources)) {
    if (rel.endsWith("components/table/CollapsedListFilters.tsx")) continue;
    const tags = extractConsumers(source);
    for (const { props, body } of tags) {
      consumers += 1;
      if (/applyLawExemptReason="QBO_SYNC_OUT_OF_SCOPE"/.test(props)) {
        exempt += 1;
        if (rel !== ALLOWED_EXEMPT) failures.push(`${rel}: unauthorized Apply-law exemption`);
        continue;
      }
      for (const prop of ["onApply", "onReset", "onCancel"]) {
        if (!new RegExp(`\\b${prop}=`).test(props)) failures.push(`${rel}: CollapsedListFilters missing ${prop}`);
      }
      const allowedLocalDraft = ALLOWED_LOCAL_DRAFT.get(rel) ?? new Set();
      const directSetters = [...body.matchAll(/\b(set[A-Z]\w*)\s*\(/g)]
        .map((match) => match[1])
        .filter((setter) => setter !== "setDraft" && !allowedLocalDraft.has(setter));
      for (const setter of new Set(directSetters)) {
        failures.push(`${rel}: ${setter} mutates applied state inside filter panel; write draft state and commit it from onApply`);
      }
    }
  }
  if (consumers < 49) failures.push(`consumer inventory shrank to ${consumers}`);
  if (exempt !== 1) failures.push(`expected exactly one QBO-sync exemption, found ${exempt}`);
  const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, INVENTORY), "utf8"));
  const sidebarSource = fs.readFileSync(path.join(ROOT, SIDEBAR), "utf8");
  const sidebarBlock = sidebarSource.match(/SIDEBAR_ITEM_IDS[\s\S]*?=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const sidebarIds = [...sidebarBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const inventoryIds = Object.keys(inventory.modules ?? {});
  for (const id of sidebarIds) if (!inventoryIds.includes(id)) failures.push(`canonical module ${id}: missing class applicability ruling`);
  for (const id of inventoryIds) if (!sidebarIds.includes(id)) failures.push(`inventory module ${id}: not in canonical SIDEBAR_ITEM_IDS`);
  for (const [id, row] of Object.entries(inventory.modules ?? {})) {
    if (row.status === "COVERED") {
      const rel = String(row.evidence || "").replace(/^apps\/frontend\/src\//, "");
      if (!sources[rel]?.includes("CollapsedListFilters")) failures.push(`${id}: COVERED evidence is not a class consumer`);
    } else if (row.status !== "N/A" || !String(row.reason || "").trim()) {
      failures.push(`${id}: must be COVERED with evidence or N/A with reason`);
    }
  }
  return { failures, consumers, exempt };
}

function extractConsumers(source) {
  const tags = [];
  const needle = "<CollapsedListFilters";
  for (let start = source.indexOf(needle); start >= 0; start = source.indexOf(needle, start + needle.length)) {
    let braces = 0;
    let quote = "";
    let escaped = false;
    let end = start + needle.length;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (escaped) { escaped = false; continue; }
      if (quote) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "{") braces += 1;
      else if (ch === "}") braces -= 1;
      else if (ch === ">" && braces === 0) break;
    }
    const close = source.indexOf("</CollapsedListFilters>", end);
    tags.push({
      props: source.slice(start + needle.length, end),
      body: close < 0 ? "" : source.slice(end + 1, close),
    });
  }
  return tags;
}

const sources = Object.fromEntries(
  walk(SRC).map((abs) => [path.relative(SRC, abs).split(path.sep).join("/"), fs.readFileSync(abs, "utf8")]),
);

const FILTER_POPOVER = "components/lists/ListView/components/FilterPopover.tsx";

/** LINK-F5170 lists:chrome.toolbar_filter — FilterPopover must draft then Apply (no silent onChange from checkbox). */
export function auditFilterPopover(source) {
  const failures = [];
  if (!source) {
    failures.push(`${FILTER_POPOVER}: file missing`);
    return failures;
  }
  if (!/\bconst \[draft, setDraft\]/.test(source)) failures.push(`${FILTER_POPOVER}: must stage draft filter values`);
  if (!/\bonClick=\{apply\}/.test(source) || !/>\s*Apply\s*</.test(source)) failures.push(`${FILTER_POPOVER}: must expose Apply`);
  if (!/\bonClick=\{cancel\}/.test(source) || !/>\s*Cancel\s*</.test(source)) failures.push(`${FILTER_POPOVER}: must expose Cancel`);
  if (!/\bonClick=\{reset\}/.test(source) || !/>\s*Reset\s*</.test(source)) failures.push(`${FILTER_POPOVER}: must expose Reset`);
  if (!/const apply = \(\) => \{[\s\S]*?onChange\(draft\)/.test(source)) {
    failures.push(`${FILTER_POPOVER}: Apply must commit draft via onChange(draft)`);
  }
  if (/onChange=\{\(\) => onChange\(/.test(source)) {
    failures.push(`${FILTER_POPOVER}: checkbox must not call applied onChange directly (silent apply)`);
  }
  if (!/onChange=\{\(\) => toggleValue\(/.test(source) && !/onChange=\{\(\) => setDraft\(/.test(source)) {
    failures.push(`${FILTER_POPOVER}: checkbox must mutate draft only (toggleValue/setDraft)`);
  }
  return failures;
}

/** CLS-COLLAPSED-FILTER-PORTAL-PICKER-CANCELS-DRAFT — portaled Combobox must not Cancel staged draft. */
export function auditPortalOwnership(collapsedSource, runnerFiltersSource) {
  const failures = [];
  if (!collapsedSource) {
    failures.push("CollapsedListFilters.tsx missing");
    return failures;
  }
  if (!collapsedSource.includes("closest('[data-combobox-listbox=\"portal\"]')")
    && !collapsedSource.includes('closest(\'[data-combobox-listbox="portal"]\')')
    && !collapsedSource.includes('closest(`[data-combobox-listbox="portal"]`)')
    && !/closest\(\s*'\[data-combobox-listbox="portal"\]'\s*\)/.test(collapsedSource)
    && !collapsedSource.includes('[data-combobox-listbox="portal"]')) {
    failures.push("CollapsedListFilters must treat [data-combobox-listbox=portal] as a logical child (not outside Cancel)");
  } else if (!collapsedSource.includes("closest(") || !collapsedSource.includes('data-combobox-listbox="portal"')) {
    failures.push("CollapsedListFilters mousedown must closest() portal listbox before Cancel");
  }
  if (!collapsedSource.includes('data-combobox-listbox="portal"') || !collapsedSource.includes("Escape")) {
    failures.push("CollapsedListFilters Escape must defer when a portal combobox listbox is open");
  }
  if (runnerFiltersSource) {
    const pickers = [...runnerFiltersSource.matchAll(/<EntityPicker\b[\s\S]*?\/>/g)].map((m) => m[0]);
    const unit = pickers.find((p) => /kind="unit"/.test(p));
    const driver = pickers.find((p) => /kind="driver"/.test(p));
    if (!unit || !/allowCreate=\{false\}/.test(unit)) failures.push("RunnerFilters unit EntityPicker must set allowCreate={false}");
    if (!driver || !/allowCreate=\{false\}/.test(driver)) failures.push("RunnerFilters driver EntityPicker must set allowCreate={false}");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fixture = {
    "pages/dispatch/Test.tsx": `<CollapsedListFilters activeFilterCount={1}>x</CollapsedListFilters>`,
    [ALLOWED_EXEMPT]: `<CollapsedListFilters applyLawExemptReason="QBO_SYNC_OUT_OF_SCOPE" activeFilterCount={1}>x</CollapsedListFilters>`,
  };
  const result = audit(fixture);
  if (!result.failures.some((failure) => failure.includes("missing onApply"))) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — missing Apply contract escaped");
    process.exit(1);
  }
  const unauthorized = audit({ "pages/dispatch/Bad.tsx": `<CollapsedListFilters applyLawExemptReason="QBO_SYNC_OUT_OF_SCOPE" activeFilterCount={1}>x</CollapsedListFilters>` });
  if (!unauthorized.failures.some((failure) => failure.includes("unauthorized"))) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — unauthorized exemption escaped");
    process.exit(1);
  }
  const silentApply = audit({ "pages/dispatch/Bad.tsx": `<CollapsedListFilters onApply={apply} onReset={reset} onCancel={cancel} activeFilterCount={1}><button onClick={() => setStatus("open")} /></CollapsedListFilters>`, [ALLOWED_EXEMPT]: `<CollapsedListFilters applyLawExemptReason="QBO_SYNC_OUT_OF_SCOPE" activeFilterCount={1}>x</CollapsedListFilters>` });
  if (!silentApply.failures.some((failure) => failure.includes("setStatus mutates applied state"))) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — silent applied-state mutation escaped");
    process.exit(1);
  }
  const silentPopover = auditFilterPopover(`
    export function FilterPopover({ onChange, activeValues }) {
      const toggleValue = (value) => onChange([...activeValues, value]);
      return <input type="checkbox" onChange={() => onChange([])} />;
    }
  `);
  if (!silentPopover.some((f) => /draft|Apply|silent apply|draft only/i.test(f))) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — FilterPopover silent apply escaped");
    process.exit(1);
  }
  const goodPopover = auditFilterPopover(fs.readFileSync(path.join(ROOT, "apps/frontend/src", FILTER_POPOVER), "utf8"));
  if (goodPopover.length) {
    console.error(`verify-collapsed-list-filters-apply SELFTEST FAIL — live FilterPopover not Apply-gated:\n${goodPopover.join("\n")}`);
    process.exit(1);
  }
  const portalPlanted = auditPortalOwnership(
    `useEffect(() => { const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) cancelAndClose(); }; }, []);`,
    `kind="unit" allowClear\nkind="driver" allowClear`,
  );
  if (!portalPlanted.some((f) => /portal|allowCreate/i.test(f))) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — portal Cancel regression escaped");
    process.exit(1);
  }
  if (!auditExactHeader(fs.readFileSync(path.join(ROOT, SELF), "utf8").replace(FILTER_EXACT_HEADER, `${FILTER_EXACT_HEADER}.broken`)).length) {
    console.error("verify-collapsed-list-filters-apply SELFTEST FAIL — exact toolbar-filter header mutation escaped");
    process.exit(1);
  }
  console.log("verify-collapsed-list-filters-apply SELFTEST PASS — missing actions, exemption abuse, FilterPopover silent-apply, portal ownership detected");
  process.exit(0);
}

const result = audit(sources);
const popoverFailures = auditFilterPopover(sources[FILTER_POPOVER] ?? "");
const portalFailures = auditPortalOwnership(
  sources["components/table/CollapsedListFilters.tsx"] ?? "",
  sources["pages/reports/runners/RunnerFilters.tsx"] ?? "",
);
const failures = [...result.failures, ...popoverFailures, ...portalFailures, ...auditExactHeader(fs.readFileSync(path.join(ROOT, SELF), "utf8"))];
if (failures.length) {
  console.error(`verify-collapsed-list-filters-apply FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-collapsed-list-filters-apply PASS — ${result.consumers} consumers require Apply/Cancel/Reset; ${result.exempt} owner-ruled QBO-sync exemption; FilterPopover draft→Apply gated; portal picker ownership OK`);
