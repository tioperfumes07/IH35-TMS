#!/usr/bin/env node
// verify:catalog-scoping-classification
//
// LST-RLS-01 / packet block 14. Whether a catalog is entity-scoped is decided by prod VALUES + POLICY, not
// by whether the `operating_company_id` column exists. Two rules written from partial evidence have already
// been wrong, and each would have caused a real defect:
//
//   * "account_types, wo_cancellation_reasons, detail_types, tire_positions, journal_entry_types are global
//     reference taxonomies, RLS-off by design" — wrong three times over: detail_types HAS the column, and
//     journal_entry_types + tire_positions have RLS enabled AND forced.
//   * "companyScoped:false iff there is no operating_company_id column" — wrong: payment_terms and
//     posting_templates also lack the column yet are catalogs each entity should own (blocks 04/05 convert
//     them), while detail_types HAS the column and must still be companyScoped:false because all 144 rows
//     are NULL and its read policy is `opco IS NULL OR = GUC` — filtering on the column reads 0 of 144.
//
// The classification lives in docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md §A.1 and the flags
// live in apps/backend/src/lists/lists-module-count-spec.ts. This guard pins them TOGETHER, because a doc
// silently disagreeing with the code is exactly what produced the cancellation-reasons canonical-direction
// contradiction (LST-F17): two sources of truth, no mechanism keeping them equal.
//
// WHAT IT PROVES, honestly: it cannot query prod, so it does not re-derive the classification. It asserts
// (a) every table named in the doc's class table carries the companyScoped flag the class requires, and
// (b) the shared-canonical trap for detail_types is documented in both places with its reason. The prod
// values behind the classification are recorded in the doc with a re-run query, and re-verifying them is
// GUARD's job on live Neon.
//
// FAILS on a doc/code disagreement, PASSES when they match. `--selftest` mutates REAL source.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:catalog-scoping-classification";
const SELFTEST = process.argv.includes("--selftest");

const DOC = "docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md";
const SPEC = "apps/backend/src/lists/lists-module-count-spec.ts";
const SCOPING_TEST = "apps/backend/src/lists/lists-module-count-spec.scoping.test.ts";
const FILES = [DOC, SPEC, SCOPING_TEST];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Classes A–D must be companyScoped:false. Class E is false TODAY and becomes true only after the
// owner-gated conversion in blocks 04/05 — so it is asserted as false-with-a-pending-note, not as final.
const MUST_BE_UNSCOPED = ["account_types", "journal_entry_types", "tire_positions", "detail_types"];

// Classified in §A.1 but deliberately ABSENT from the count spec, so the hub does not count them. Each needs
// its reason recorded in the doc. `wo_cancellation_reasons` has a mounted read-only route
// (apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts, registered in catalogs/index.ts) and ZERO
// frontend callers — a dead surface, not a counted catalog. If one is ever wired up it must arrive as
// companyScoped:false (class A), which is asserted below.
const CLASSIFIED_NOT_COUNTED = ["wo_cancellation_reasons"];

// The other half of the rule, and the one that keeps the exclusion list honest in the opposite direction:
// a catalog whose operating_company_id is POPULATED per entity must NOT be excluded. complaint_types is the
// reference case — 12/12/12 across TRANSP/TRK/USMCA, policy `= GUC`. Excluding it would hide per-entity rows.
const MUST_BE_SCOPED = ["complaint_types"];

export function assertCatalogScopingClassification(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];

  const doc = get(DOC);
  const spec = get(SPEC);

  // ── 1. the doc must carry the classification section at all ───────────────────────────────────────
  if (!/### A\.1 CATALOG SCOPING CLASSIFICATION/.test(doc)) {
    errs.push(`${DOC}: missing the "A.1 CATALOG SCOPING CLASSIFICATION" section — the registry blocks 04/08 consume`);
  }

  // ── 2. every table the doc classifies A–D must be companyScoped:false in the spec ─────────────────
  const flags = new Map();
  const re = /\{\s*table:\s*"([a-z_]+)"[^}]*companyScoped:\s*(true|false)/g;
  let m;
  while ((m = re.exec(spec))) flags.set(m[1], m[2] === "true");

  for (const table of MUST_BE_UNSCOPED) {
    if (!doc.includes(table)) {
      errs.push(`${DOC}: §A.1 no longer classifies ${table} — the registry must stay complete`);
    }
    if (!flags.has(table)) {
      errs.push(`${SPEC}: ${table} has no companyScoped flag — cannot be reconciled with the §A.1 classification`);
      continue;
    }
    if (flags.get(table) === true) {
      errs.push(
        `${SPEC}: ${table} is companyScoped:true but §A.1 classifies it as global/shared-canonical — scoping it filters on a column that is absent or all-NULL and will read 0 rows`,
      );
    }
  }

  // Classified but not counted: the doc must say WHY, and if the table is ever added to the spec it must
  // arrive unscoped. Silence here is how a dead surface becomes an invisible undercount (LST-COUNT-01).
  for (const table of CLASSIFIED_NOT_COUNTED) {
    if (!doc.includes(table)) {
      errs.push(`${DOC}: §A.1 must classify ${table} and record that it is deliberately not counted`);
    }
    if (flags.has(table) && flags.get(table) === true) {
      errs.push(
        `${SPEC}: ${table} was added as companyScoped:true — it has no operating_company_id on prod (class A), so scoping it reads 0 rows`,
      );
    }
  }

  // ── 2b. populated per-entity catalogs must NOT be excluded ───────────────────────────────────────
  for (const table of MUST_BE_SCOPED) {
    if (!flags.has(table)) {
      errs.push(`${SPEC}: ${table} has no companyScoped flag — a populated per-entity catalog must be counted per entity`);
      continue;
    }
    if (flags.get(table) === false) {
      errs.push(
        `${SPEC}: ${table} is companyScoped:false but its operating_company_id is POPULATED per entity on prod (12/12/12) — excluding it hides per-entity rows`,
      );
    }
  }

  // ── 3. the shared-canonical trap must be spelled out where a reader will hit it ───────────────────
  // detail_types is the one that fooled two agents: the column exists, so it LOOKS entity-scoped.
  if (!/SHARED CANONICAL/i.test(doc) || !/144/.test(doc)) {
    errs.push(
      `${DOC}: §A.1 must document the shared-canonical class with its prod evidence (detail_types: 144 rows, all operating_company_id NULL)`,
    );
  }
  const scopingTest = get(SCOPING_TEST);
  if (!/detail_types/.test(scopingTest) || !/companyScoped:true would count 0/.test(scopingTest)) {
    errs.push(
      `${SCOPING_TEST}: must keep the detail_types shared-canonical assertion and its "companyScoped:true would count 0" reason`,
    );
  }

  // ── 4. class E must not be silently relabelled as global-by-design ───────────────────────────────
  // payment_terms / posting_templates lack the column TODAY but are conversion targets (blocks 04/05).
  // Calling them "global by design" would cancel that work; the doc must keep them in the pending class.
  for (const pending of ["payment_terms", "posting_templates"]) {
    if (!doc.includes(pending)) {
      errs.push(`${DOC}: §A.1 must list ${pending} as a pending conversion (class E), not omit it`);
    }
  }
  if (!/entity-blind DEFECT, conversion pending/i.test(doc)) {
    errs.push(
      `${DOC}: §A.1 must keep the "entity-blind DEFECT, conversion pending" class — a missing opco column is not proof of global-by-design intent`,
    );
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertCatalogScopingClassification(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "doc-section-removed",
    { ...live, [DOC]: live[DOC].replace("### A.1 CATALOG SCOPING CLASSIFICATION", "### A.1 (removed)") },
    "missing the \"A.1 CATALOG SCOPING CLASSIFICATION\" section",
  );
  expectCaught(
    "detail-types-wrongly-scoped",
    { ...live, [SPEC]: live[SPEC].replace('{ table: "detail_types", activeFilter: "is_active", companyScoped: false }', '{ table: "detail_types", activeFilter: "is_active", companyScoped: true }') },
    "will read 0 rows",
  );
  expectCaught(
    "account-types-wrongly-scoped",
    { ...live, [SPEC]: live[SPEC].replace('{ table: "account_types", activeFilter: "is_active", companyScoped: false }', '{ table: "account_types", activeFilter: "is_active", companyScoped: true }') },
    "account_types is companyScoped:true",
  );
  expectCaught(
    "populated-per-entity-catalog-wrongly-excluded",
    { ...live, [SPEC]: live[SPEC].replace(/\{ table: "complaint_types", ([^}]*?)companyScoped: true/, '{ table: "complaint_types", $1companyScoped: false') },
    "excluding it hides per-entity rows",
  );
  expectCaught(
    "shared-canonical-evidence-dropped",
    { ...live, [DOC]: live[DOC].replace(/SHARED CANONICAL/g, "regular") },
    "must document the shared-canonical class",
  );
  expectCaught(
    "scoping-test-reason-dropped",
    { ...live, [SCOPING_TEST]: live[SCOPING_TEST].replace(/companyScoped:true would count 0/g, "see notes") },
    "companyScoped:true would count 0",
  );
  expectCaught(
    "pending-class-relabelled-global",
    { ...live, [DOC]: live[DOC].replace(/entity-blind DEFECT, conversion pending/gi, "global by design") },
    "not proof of global-by-design intent",
  );

  const liveProblems = assertCatalogScopingClassification(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 7 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCatalogScopingClassification();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — §A.1 classification and lists-module-count-spec agree; the shared-canonical trap (detail_types) and the pending-conversion class are both documented.`,
);
