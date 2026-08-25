#!/usr/bin/env node
/**
 * SAF-F6366 — safety.da_test_records and safety.da_program_enrollments both have
 * operating_company_id typed TEXT (confirmed live via information_schema.columns; unlike every
 * other safety.* table, which is uuid). listTestRecords() and listEnrollments() in
 * program.service.ts each carry an EXISTS subquery comparing
 * mdata.driver_company_authorizations.company_id (uuid) directly against that TEXT column with
 * no cast -- Postgres 42883 "operator does not exist: uuid = text" on EVERY call, live-reproduced
 * via a real authenticated fetch against api.ih35dispatch.com before this fix (both endpoints
 * 500'd unconditionally). The same TEXT-not-uuid gotcha was already independently discovered and
 * correctly cast in two OTHER files (safety-home.service.ts, driver-qualification.service.ts) --
 * this guard closes the two sites in program.service.ts that were missed.
 *
 * Also re-verified directly against live Neon prod data (both corrected queries execute with zero
 * rows returned -- no error -- for a real operating_company_id) before writing this guard.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/safety/drug-alcohol/program.service.ts";

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function audit(source) {
  const failures = [];
  const stripped = stripComments(source);
  if (!/da_enrollment_label_dca\.company_id::text = e\.operating_company_id/.test(stripped)) {
    failures.push(
      `${FILE}: listEnrollments()'s EXISTS subquery must cast da_enrollment_label_dca.company_id::text before comparing to e.operating_company_id (TEXT column) -- or Postgres 42883s on every call`
    );
  }
  if (!/da_test_label_dca\.company_id::text = t\.operating_company_id/.test(stripped)) {
    failures.push(
      `${FILE}: listTestRecords()'s EXISTS subquery must cast da_test_label_dca.company_id::text before comparing to t.operating_company_id (TEXT column) -- or Postgres 42883s on every call`
    );
  }
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
const failures = audit(source);

if (failures.length) {
  console.error(`verify-drug-alcohol-company-id-cast FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "remove ::text cast in listEnrollments (reintroduce the 500)",
      mutate: (t) => t.replace("da_enrollment_label_dca.company_id::text = e.operating_company_id", "da_enrollment_label_dca.company_id = e.operating_company_id"),
    },
    {
      name: "remove ::text cast in listTestRecords (reintroduce the 500)",
      mutate: (t) => t.replace("da_test_label_dca.company_id::text = t.operating_company_id", "da_test_label_dca.company_id = t.operating_company_id"),
    },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change source -- inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-drug-alcohol-company-id-cast SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log(
  "verify-drug-alcohol-company-id-cast PASS — both Drug & Alcohol Program EXISTS subqueries cast company_id::text before comparing to the TEXT operating_company_id column"
);
