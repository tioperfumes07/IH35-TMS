#!/usr/bin/env node
/**
 * CUST-LINK-02 — COI Requests tab honest empty + create writer stamps operating_company_id.
 *
 * Live Neon: coi_request RLS WITH CHECK keys operating_company_id. INSERT that only sets
 * tenant_id leaves operating_company_id NULL → 42501 on every + Create COI (blocks reverse_link).
 *
 *   node scripts/verify-cust-link-02-coi-honest-empty.mjs
 *   node scripts/verify-cust-link-02-coi-honest-empty.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-cust-link-02-coi-honest-empty";
const FILE = "apps/frontend/src/pages/customers/CoiTab.tsx";
const SERVICE = "apps/backend/src/insurance/coi.service.ts";

function assertUi(src) {
  const problems = [];
  if (!/emptyText=/.test(src)) {
    problems.push(`${FILE}: ParityTable/list must set emptyText`);
  }
  if (!/No COI requests yet/.test(src)) {
    problems.push(`${FILE}: emptyText must say "No COI requests yet" (honest empty)`);
  }
  if (/emptyText=\{?\s*["']\s*["']\s*\}?/.test(src)) {
    problems.push(`${FILE}: emptyText must not be blank`);
  }
  if (!/\+ Create COI/.test(src)) {
    problems.push(`${FILE}: empty state surface must still offer + Create COI`);
  }
  for (const [kind, id, name, noun] of [
    ["user", "request.requested_by", "request.requested_by_name", "User"],
    ["insurance_policy", "request.policy_id", "request.policy_number", "Policy"],
  ]) {
    const pattern = new RegExp(`<EntityLinkOrTombstone[\\s\\S]{0,140}?kind="${kind}"[\\s\\S]{0,140}?id=\\{${id.replaceAll(".", "\\.")}\\}[\\s\\S]{0,140}?name=\\{${name.replaceAll(".", "\\.")}\\}[\\s\\S]{0,100}?noun="${noun}"`);
    if (!pattern.test(src)) problems.push(`${FILE}: ${noun} reverse drill must preserve its nullable human label/tombstone contract`);
  }
  return problems;
}

function assertWriter(src) {
  const problems = [];
  const insert = src.match(/INSERT INTO insurance\.coi_request\s*\(([\s\S]*?)\)\s*VALUES/i);
  if (!insert) {
    problems.push(`${SERVICE}: createCoiRequest must INSERT INTO insurance.coi_request`);
    return problems;
  }
  const cols = insert[1];
  if (!/\boperating_company_id\b/.test(cols)) {
    problems.push(
      `${SERVICE}: INSERT must stamp operating_company_id (RLS WITH CHECK) — tenant_id alone → 42501`,
    );
  }
  if (!/\btenant_id\b/.test(cols)) {
    problems.push(`${SERVICE}: INSERT must keep tenant_id for legacy readers`);
  }
  return problems;
}

const uiSrc = readFileSync(path.join(ROOT, FILE), "utf8");
const svcSrc = readFileSync(path.join(ROOT, SERVICE), "utf8");

if (SELFTEST) {
  const plantedUi = uiSrc.replace(/No COI requests yet[^"]*/g, "");
  const caughtUi = assertUi(plantedUi);
  if (!caughtUi.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted blank empty not caught`);
    process.exit(1);
  }
  for (const [needle, label] of [
    ["name={request.requested_by_name}", "requester name"],
    ["name={request.policy_number}", "policy number"],
  ]) {
    const planted = uiSrc.replace(needle, "name={null}");
    if (planted === uiSrc || !assertUi(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted ${label} defect not caught`);
      process.exit(1);
    }
  }
  const plantedSvc = svcSrc.replace(/\boperating_company_id\b/g, "opco_missing");
  const caughtSvc = assertWriter(plantedSvc);
  if (!caughtSvc.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted missing operating_company_id not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = [...assertUi(uiSrc), ...assertWriter(svcSrc)];
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — CoiTab honest empty + createCoiRequest stamps operating_company_id for RLS`,
);
process.exit(0);
