#!/usr/bin/env node
/**
 * LEAD 443.192 (verify-pl-cost-of-revenue): revrec Event 1 (earn) is dated by the evidence that let it post — the final
 * active delivery stop's departure, or the manual delivery authorization's own timestamp — never by when the code ran.
 * Measured on main before this step: accounting/revrec-delivery-posting/poster.service.ts read the departure only as the
 * gate and dated the JE `input.entry_date_iso`, which every delivery path fills with companyBusinessDate() at fire time
 * (dispatch/delivery-evidence-latch.ts:82). Prod: every latch earn dated the fire day (2026-10-16), 15 standing earns
 * on loads delivered 10-05..10-14.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POSTER = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = read(POSTER)) {
  const p = [];
  const resolver = src.match(/export async function resolveEarnEntryDate\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!resolver || !/AT TIME ZONE/.test(resolver) || !/closed_period_cutoff/.test(resolver))
    p.push(`${POSTER}: resolveEarnEntryDate must turn the evidence timestamp into a company business date and fall back only for a closed period`);
  const latch = src.match(/export async function postLoadRevenueLatch\([\s\S]*?\n\}\n/)?.[0] ?? "";
  if (!/evidenceAt = authorizedAt/.test(latch) || !/let evidenceAt = departedAt/.test(latch))
    p.push(`${POSTER}: the earn's evidence must be the departure, else the manual authorization timestamp`);
  if (!/entryDate = await resolveEarnEntryDate\(client, input\.operating_company_id, evidenceAt, input\.entry_date_iso\)/.test(latch))
    p.push(`${POSTER}: the earn must be dated through resolveEarnEntryDate(evidenceAt)`);
  if (/entryDate:\s*input\.entry_date_iso/.test(latch))
    p.push(`${POSTER}: the JE is dated by the caller's fire-time date again — use the evidence-resolved entryDate`);
  if (!/\n\s+entryDate,\n/.test(latch)) p.push(`${POSTER}: the latch JE must carry the resolved entryDate`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = read(POSTER);
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["JE dated by fire time", base.replace(/\n(\s+)entryDate,\n/, "\n$1entryDate: input.entry_date_iso.slice(0, 10),\n")],
    ["resolver call removed", base.replace("entryDate = await resolveEarnEntryDate(client, input.operating_company_id, evidenceAt, input.entry_date_iso)", "entryDate = input.entry_date_iso.slice(0, 10)")],
    ["manual authorization not used as evidence", base.replace("evidenceAt = authorizedAt", "evidenceAt = null")],
    ["UTC calendar day instead of company day", base.replace("AT TIME ZONE $3", "")],
  ];
  for (const [n, src] of plants) {
    if (src === base) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-revenue-earn-dated-by-evidence: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-revenue-earn-dated-by-evidence: OK — revrec earn is dated by its delivery evidence (company business date).");
}
