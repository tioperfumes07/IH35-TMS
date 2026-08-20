#!/usr/bin/env node
/** Accounting Abandonment Queue scoped identity linkage + reverse drills. */
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
  for (const projection of [/l\.load_number/, /AS driver_name/, /ds\.display_id AS settlement_display_id/]) if (!projection.test(s.backend)) errors.push(`backend missing identity projection ${projection}`);
  for (const field of ["load_number", "driver_name", "settlement_display_id"]) if (!new RegExp(`${field}: string \\| null`).test(s.api)) errors.push(`API type missing nullable ${field}`);
  const drills = [
    /<EntityLinkOrTombstone kind="load" id=\{row\.load_id\} name=\{row\.load_number\} noun="Load"/,
    /<EntityLinkOrTombstone kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
    /<EntityLinkOrTombstone kind="settlement" id=\{row\.applied_to_settlement_id\} name=\{row\.settlement_display_id\} noun="Settlement"/,
  ];
  for (const pattern of drills) if (!pattern.test(s.page)) errors.push(`queue missing canonical drill ${pattern}`);
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
    ["backend", "ds.display_id AS settlement_display_id", "NULL AS settlement_display_id"],
    ["api", "load_number: string | null", "load_number: unknown"],
    ["api", "driver_name: string | null", "driver_name: unknown"],
    ["api", "settlement_display_id: string | null", "settlement_display_id: unknown"],
    ["page", "name={row.load_number}", "name={null}"],
    ["page", "name={row.driver_name}", "name={null}"],
    ["page", "name={row.settlement_display_id}", "name={null}"],
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
