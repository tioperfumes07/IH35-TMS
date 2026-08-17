#!/usr/bin/env node
/**
 * verify-adjacent-entity-filter-silent-apply.mjs
 * CLS-ADJACENT-ENTITY-FILTER-SILENT-APPLY
 *
 * Nine list surfaces must not mount company-scoped EntityPickers beside
 * CollapsedListFilters that write URL/query immediately. Entity FKs belong in
 * the same staged tuple and commit only on Apply.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-adjacent-entity-filter-silent-apply";

/** Exact Codex inventory — adjacent EntityPicker class (not nested-portal class). */
const TARGETS = [
  {
    file: "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx",
    entityKeys: ["unitId"],
  },
  {
    file: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
    entityKeys: ["driverId", "unitId"],
  },
  {
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    entityKeys: ["unitId", "loadId"],
  },
  {
    file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx",
    entityKeys: ["vendorId"],
  },
  {
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    entityKeys: ["sourceLoadId"],
  },
  {
    file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx",
    entityKeys: ["loadId"],
  },
  {
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    entityKeys: ["loadId", "driverId", "unitId", "trailerId"],
  },
  {
    file: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
    entityKeys: ["driverId"],
  },
  {
    file: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx",
    entityKeys: ["driverId", "loadId"],
  },
];

function analyze(src, entityKeys) {
  const failures = [];
  if (!/useStagedListFilters/.test(src) || !/CollapsedListFilters/.test(src)) {
    failures.push("must use CollapsedListFilters + useStagedListFilters");
  }
  if (!/onApply=\{staged\.apply\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src) || !/onCancel=\{staged\.cancel\}/.test(src)) {
    failures.push("must wire Apply/Cancel/Reset to staged handlers");
  }
  for (const key of entityKeys) {
    if (!new RegExp(`applied:\\s*\\{[\\s\\S]*?\\b${key}\\b`).test(src) && !new RegExp(`applied:\\s*\\{[^}]*\\b${key}\\b`).test(src)) {
      // Prefer: key appears in applied: { ... } block
      if (!new RegExp(`\\b${key}\\b`).test(src) || !new RegExp(`applied:[\\s\\S]{0,400}\\b${key}\\b`).test(src)) {
        failures.push(`staged applied must include ${key}`);
      }
    }
    if (!new RegExp(`staged\\.draft\\.${key}`).test(src)) {
      failures.push(`EntityPicker must bind staged.draft.${key}`);
    }
  }
  // Adjacent silent-apply: EntityPicker before CollapsedListFilters in filter chrome.
  // Allow create-modal EntityPickers that appear after the filter panel closes.
  const filterBarMatch = src.match(/filterBar=\{([\s\S]*?)(?=\n\s{2,}[a-zA-Z_]+=|\n\s*\/>|\n\s*\})/);
  const chrome = filterBarMatch ? filterBarMatch[1] : src;
  // Simpler: between first EntityPicker and CollapsedListFilters — if EntityPicker's onChange
  // still calls patch*/set*Filter helpers directly (not staged.setDraft), fail.
  const pickerBlocks = [...src.matchAll(/<EntityPicker[\s\S]*?\/>/g)].map((m) => m[0]);
  const filterPickers = pickerBlocks.filter((b) => /allowCreate=\{false\}/.test(b) || /allowCreate=\{false\}/.test(b));
  // Prefer draft binding on filter pickers that also carry placeholder/All or dataTestId filter
  const silent = pickerBlocks.filter(
    (b) =>
      /onChange=\{\(next\) => (?:set|patch)[A-Za-z]+\(/.test(b) ||
      /onChange=\{\(next\) => patchEntityFilter\(/.test(b) ||
      /onChange=\{\(next\) => patchLoadFilter\(/.test(b) ||
      /onChange=\{\(next\) => setSourceLoadId\(/.test(b) ||
      /onChange=\{\(next\) => setVendorFilter\(/.test(b) ||
      /onChange=\{\(next\) => setDriverFilter\(/.test(b) ||
      /onChange=\{\(next\) => setUnitFilter\(/.test(b) ||
      /onChange=\{\(next\) => setLoadFilter\(/.test(b),
  );
  // Exclude create-flow pickers that are not filters (Invoices create often lacks allowCreate={false}
  // or sits outside filterBar). Fail if any silent onChange remains with allowCreate={false}.
  const silentFilters = silent.filter((b) => /allowCreate=\{false\}/.test(b));
  if (silentFilters.length) {
    failures.push(`adjacent EntityPicker still silent-applies (${silentFilters.length})`);
  }
  void chrome;
  void filterPickers;
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL:\n  ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    useStagedListFilters({ applied: { status, unitId }, empty: { status: "", unitId: "" }, onApply });
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
    <EntityPicker allowCreate={false} value={staged.draft.unitId || null}
      onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })} />
  `;
  const bad = `
    useStagedListFilters({ applied: { status }, empty: { status: "" }, onApply });
    <EntityPicker allowCreate={false} onChange={(next) => setUnitFilter(next ?? "")} />
    <CollapsedListFilters onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel}>
  `;
  if (analyze(good, ["unitId"]).length) fail(`selftest GOOD: ${analyze(good, ["unitId"]).join("; ")}`);
  if (!analyze(bad, ["unitId"]).length) fail("selftest expected BAD to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const all = [];
for (const t of TARGETS) {
  const src = fs.readFileSync(path.join(process.cwd(), t.file), "utf8");
  const failures = analyze(src, t.entityKeys);
  for (const f of failures) all.push(`${t.file}: ${f}`);
}
if (all.length) fail(all.join("\n  "));
console.log(`${LABEL} PASS — ${TARGETS.length} surfaces stage adjacent EntityPickers`);
