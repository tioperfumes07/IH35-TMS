#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking"],"cols":["connectivity"],"leafRe":"^account_filters_multi_select$","task":"ROUND-363-CUR-C-ACCOUNT-FILTERS-MULTI-SELECT"} */
/**
 * ROUND 363-CUR-C — account filters on list/report bars are multi-select.
 *
 * Owner: "the filter accounts in the entire app must be a multiple selector."
 * Single-select is a defect wherever it appears as a filter (All accounts).
 * Document fields (one account on a creator / recon start) stay single.
 *
 * Detector (conservative, shrink-only):
 *   A page is a single-select account FILTER when a SelectCombobox / ReferenceSelect /
 *   native <select> still offers an "All accounts" option, and the file does not mount
 *   MultiSelectDropdown with label Account or Bank account.
 *
 * CC-2 Reclassify already uses MultiSelectDropdown — this guard only fails if that drops.
 *
 * Usage:
 *   node scripts/verify-account-filters-are-multi-select.mjs
 *   node scripts/verify-account-filters-are-multi-select.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-filters-are-multi-select";
const SELFTEST = process.argv.includes("--selftest");
const PAGES = path.join(ROOT, "apps/frontend/src/pages");
const RECLASSIFY = "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";

/**
 * SHRINK-ONLY — pages that still expose a single-select "All accounts" filter.
 * Measured 2026-10-05 after converting BankingObligationReconcile + Plaid company tx.
 * May only fall.
 */
const SINGLE_SELECT_BASELINE = 2;

const ALL_ACCOUNTS_SELECT_RE =
  /<(SelectCombobox|ReferenceSelect|select)\b[\s\S]{0,1200}All accounts/;
const MULTI_ACCOUNT_FILTER_RE =
  /<MultiSelectDropdown\b[^>]*label="(?:Account|Bank account)"/;

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    if (ent.name === "__tests__") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(p, out);
    else if (/\.tsx$/.test(ent.name) && !/\.test\.tsx$/.test(ent.name)) out.push(p);
  }
  return out;
}

export function measureSingleSelectAccountFilters(srcByRel) {
  const offenders = [];
  for (const [rel, src] of Object.entries(srcByRel)) {
    const body = stripComments(src);
    if (!ALL_ACCOUNTS_SELECT_RE.test(body)) continue;
    if (MULTI_ACCOUNT_FILTER_RE.test(body)) continue;
    offenders.push(rel);
  }
  return { count: offenders.length, offenders };
}

function loadSources() {
  const out = {};
  for (const abs of walkTsx(PAGES)) {
    out[path.relative(ROOT, abs)] = fs.readFileSync(abs, "utf8");
  }
  return out;
}

function main() {
  const fails = [];
  const srcByRel = loadSources();

  if (SELFTEST) {
    const plant = { ...srcByRel };
    const victim =
      "apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx";
    plant[victim] = `
      export function Plant() {
        return (
          <SelectCombobox value="">
            <option value="">All accounts</option>
          </SelectCombobox>
        );
      }
    `;
    const m = measureSingleSelectAccountFilters(plant);
    if (m.count <= SINGLE_SELECT_BASELINE) {
      console.error(
        `${LABEL}: --selftest FAIL — planted single-select not detected (${m.count} ≤ ${SINGLE_SELECT_BASELINE})`,
      );
      process.exit(1);
    }
    const reclass = srcByRel[RECLASSIFY] ?? "";
    if (!MULTI_ACCOUNT_FILTER_RE.test(stripComments(reclass))) {
      console.error(`${LABEL}: --selftest FAIL — Reclassify flagship MultiSelectDropdown missing`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: --selftest PASS — plant ${m.count} > ${SINGLE_SELECT_BASELINE}; Reclassify MultiSelectDropdown present`,
    );
    process.exit(0);
  }

  const measured = measureSingleSelectAccountFilters(srcByRel);
  if (measured.count > SINGLE_SELECT_BASELINE) {
    fails.push(
      `single-select All-accounts filters ${measured.count} > baseline ${SINGLE_SELECT_BASELINE} (shrink-only). Offenders: ${measured.offenders.join(", ")}`,
    );
  }

  const reclassSrc = srcByRel[RECLASSIFY];
  if (!reclassSrc) {
    fails.push(`${RECLASSIFY}: missing — Reclassify flagship required`);
  } else if (!MULTI_ACCOUNT_FILTER_RE.test(stripComments(reclassSrc))) {
    fails.push(`${RECLASSIFY}: MultiSelectDropdown label="Account" required`);
  }

  if (fails.length) {
    console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }

  console.log(
    `${LABEL}: PASS — single-select All-accounts filters ${measured.count} ≤ ${SINGLE_SELECT_BASELINE}; remaining: ${measured.offenders.join(", ") || "none"}`,
  );
}

main();
