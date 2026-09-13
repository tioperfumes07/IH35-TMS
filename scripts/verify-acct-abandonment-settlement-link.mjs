#!/usr/bin/env node
/**
 * Accounting Abandonment Queue scoped identity linkage + reverse drills.
 * MATRIX-BUILT-OPTIONAL — not a Program-matrix wiring guard; the EntityLinkOrTombstone checks here
 * are one of several load/driver/settlement identity-linkage invariants for this one page, not a
 * leaf-completion signal for the wire-sprint matrix.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-abandonment-settlement-link";
const FILES = {
  page: "apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx",
  api: "apps/frontend/src/api/abandonment.ts",
  backend: "apps/backend/src/driver-finance/abandonment.routes.ts",
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function failures(s) {
  const errors = [];
  const joins = [
    ["load", /LEFT JOIN mdata\.loads l[\s\S]{0,180}l\.id = ac\.load_id[\s\S]{0,120}l\.operating_company_id = ac\.operating_company_id/],
    ["driver", /LEFT JOIN mdata\.drivers d[\s\S]{0,180}d\.id = ac\.driver_id[\s\S]{0,120}d\.operating_company_id = ac\.operating_company_id/],
    ["settlement", /LEFT JOIN driver_finance\.driver_settlements ds[\s\S]{0,200}ds\.id = ac\.applied_to_settlement_id[\s\S]{0,120}ds\.operating_company_id = ac\.operating_company_id/],
  ];
  for (const [name, pattern] of joins) if (!pattern.test(s.backend)) errors.push(`backend missing same-company ${name} label join`);
  // ACCT-F26303 (2026-09-13) — settlement_display_id is aliased FROM source_document_ref, never the
  // retired internal display_id (ALL-SEATS settlement-number law); this projection check was stale,
  // still asserting the pre-law column name that was already corrected on main.
  for (const projection of [/l\.load_number/, /AS driver_name/, /ds\.source_document_ref AS settlement_display_id/]) if (!projection.test(s.backend)) errors.push(`backend missing identity projection ${projection}`);
  for (const field of ["load_number", "driver_name", "settlement_display_id"]) if (!new RegExp(`${field}: string \\| null`).test(s.api)) errors.push(`API type missing nullable ${field}`);
  const drills = [
    /<EntityLinkOrTombstone kind="load" id=\{row\.load_id\} name=\{row\.load_number\} noun="Load"/,
    /<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
  ];
  for (const pattern of drills) if (!pattern.test(s.page)) errors.push(`queue missing canonical drill ${pattern}`);
  // ACCT-F26303 — the settlement drill's JSX may now span multiple lines and its `name` may route
  // through the canonical settlementLabel() helper instead of a raw field access (both are law-
  // compliant; the guard must recognize either shape without depending on single-line formatting).
  const settlementDrill =
    /<EntityLinkOrTombstone[\s\S]{0,40}kind="settlement"[\s\S]{0,40}id=\{row\.applied_to_settlement_id\}[\s\S]{0,150}noun="Settlement"/;
  if (!settlementDrill.test(s.page)) errors.push("queue missing canonical settlement drill (EntityLinkOrTombstone kind=\"settlement\")");
  const settlementNameSource =
    /name=\{(?:row\.settlement_display_id|settlementLabel\(\{[\s\S]{0,40}source_document_ref:\s*row\.[a-zA-Z_]+[\s\S]{0,40}\}\))\}/;
  if (!settlementNameSource.test(s.page))
    errors.push("queue's settlement drill must render row.settlement_display_id or settlementLabel({ source_document_ref: row.<field> }) — never a raw/invented value");
  if (/entityLabel\(null, (loadId|driverId|settlementId)/.test(s.page)) errors.push("queue must not rebuild identity labels from UUIDs");
  if (!/onError:\s*\(e: unknown\) => pushToast\(userFacingApiError\(e, "Could not approve chargeback"\)/.test(s.page)) errors.push("approval failure must retain shared human-facing error copy");
  return errors;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["backend", "l.operating_company_id = ac.operating_company_id", "TRUE"],
    ["backend", "d.operating_company_id = ac.operating_company_id", "TRUE"],
    ["backend", "ds.operating_company_id = ac.operating_company_id", "TRUE"],
    ["backend", "l.load_number", "NULL AS load_number"],
    ["backend", "AS driver_name", "AS missing_driver_name"],
    ["backend", "ds.source_document_ref AS settlement_display_id", "NULL AS settlement_display_id"],
    ["api", "load_number: string | null", "load_number: unknown"],
    ["api", "driver_name: string | null", "driver_name: unknown"],
    ["api", "settlement_display_id: string | null", "settlement_display_id: unknown"],
    ["page", "name={row.load_number}", "name={null}"],
    ["page", "name={row.driver_name}", "name={null}"],
    ["page", "source_document_ref: row.settlement_display_id", "source_document_ref: null"],
    ["page", 'kind="settlement"', 'kind="settlement-mutated"'],
  ];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) throw new Error(`${LABEL}: mutation anchor missing: ${needle}`);
    const mutant = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) throw new Error(`${LABEL}: planted defect escaped: ${needle}`);
  }
  console.log(`${LABEL}: SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const errors = failures(sources);
if (errors.length) {
  console.error(`${LABEL}: FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — scoped load/driver/settlement labels and tombstone-safe reverse drills`);
