#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","customers","dispatch","docs","drivers","finance","fleet","insurance","legal","lists","maintenance","reports","safety","settlements","vendors"],"cols":["qbo_chrome"],"leafRe":"^chrome\\.toolbar_(search|range|gear)$|.*","task":"CLS-FILTER-GEAR-APPLY","vertical":"class-sweep"} */
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
  console.log("verify-collapsed-list-filters-apply SELFTEST PASS — missing actions and exemption abuse detected");
  process.exit(0);
}

const result = audit(sources);
if (result.failures.length) {
  console.error(`verify-collapsed-list-filters-apply FAIL:\n${result.failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-collapsed-list-filters-apply PASS — ${result.consumers} consumers require Apply/Cancel/Reset; ${result.exempt} owner-ruled QBO-sync exemption`);
