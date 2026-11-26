#!/usr/bin/env node
/**
 * PERFUME-CONTACTS-IMPORT-SPEED — the contacts import and the Google run must match keys through ContactMatcher
 * (one read per batch / run), never with per-record SQL key scans. Under FORCE RLS (perfume.is_owner()) the planner
 * cannot use an index for right(regexp_replace(phone…)) or phone_keys @> …, so each lookup scanned every row: prod
 * 2026-11-26 a 500-record batch went 8 s -> 277 s -> 502 as the table grew to ~3,800 companies.
 */
import fs from "node:fs";

const LABEL = "verify-perfume-contacts-matcher";
const IMPORT = "apps/backend/src/perfume/contacts.import.ts";
const SERVICE = "apps/backend/src/perfume/contacts.service.ts";
const MATCHER = "apps/backend/src/perfume/contacts.matcher.ts";
const PHONE_SCAN = /regexp_replace\(coalesce\(phone/;

export function check({ imp, svc, mat }) {
  const f = [];
  if (!/export class ContactMatcher/.test(mat) || !/static async load\(/.test(mat)) f.push(`${MATCHER} must export ContactMatcher with load()`);
  if (PHONE_SCAN.test(imp) || /phone_keys @>/.test(imp)) f.push(`${IMPORT} must not run per-record phone key scans (use ContactMatcher)`);
  if (!/ContactMatcher\.load\(c\)/.test(imp)) f.push(`${IMPORT} importRecords must load ContactMatcher once per batch`);
  if (!/m\.refreshCompany\(c, id\)/.test(imp)) f.push(`${IMPORT} must refresh the matcher after an insert or fill-in`);
  if (!/m\.addPerson\(/.test(imp)) f.push(`${IMPORT} must add new people to the matcher`);
  const batch = svc.slice(svc.indexOf("export async function startBatch"));
  if (!/ContactMatcher\.load\(c\)/.test(batch)) f.push(`${SERVICE} startBatch must load ContactMatcher once per run`);
  if (!/saveProspect\(c, r, s\.keyword, s\.textQuery, uid, m\)/.test(batch)) f.push(`${SERVICE} startBatch must pass the matcher to saveProspect`);
  const single = svc.slice(svc.indexOf("export async function singleSearch"), svc.indexOf("export async function startBatch"));
  if (!/saveProspect\(c, r, kw, textQuery, uid, m\)/.test(single)) f.push(`${SERVICE} singleSearch must pass the matcher to saveProspect`);
  return f;
}

const read = (p) => fs.readFileSync(p, "utf8");
const live = () => ({ imp: read(IMPORT), svc: read(SERVICE), mat: read(MATCHER) });

if (process.argv.includes("--selftest")) {
  const good = live();
  const clean = check(good);
  if (clean.length) { console.error(`${LABEL} --selftest FAILED: live tree should pass`, clean); process.exit(1); }
  const plants = [
    ["per-record phone scan back in the import", { ...good, imp: good.imp + "\nconst x = `right(regexp_replace(coalesce(phone, ''), '\\\\D', '', 'g'), 10)`;" }],
    ["import stops loading the matcher", { ...good, imp: good.imp.replace("ContactMatcher.load(c)", "null") }],
    ["batch run drops the matcher", { ...good, svc: good.svc.replace("saveProspect(c, r, s.keyword, s.textQuery, uid, m)", "saveProspect(c, r, s.keyword, s.textQuery, uid)") }],
    ["single search drops the matcher", { ...good, svc: good.svc.replace("saveProspect(c, r, kw, textQuery, uid, m)", "saveProspect(c, r, kw, textQuery, uid)") }],
  ];
  for (const [name, src] of plants) {
    if (!check(src).length) { console.error(`${LABEL} --selftest FAILED: plant "${name}" was not caught`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS: ${plants.length} plants caught`);
} else {
  const f = check(live());
  if (f.length) { console.error(`${LABEL} FAIL:`); for (const x of f) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL} PASS — contacts import and Google run match through ContactMatcher`);
}
