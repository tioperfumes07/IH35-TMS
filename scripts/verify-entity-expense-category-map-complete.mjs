#!/usr/bin/env node
/**
 * GUARD — ACCT-F98: an active operating entity must carry an expense-side category map, and the
 * per-driver sub-account creator must not depend on QuickBooks to number its accounts.
 *
 * THE DEFECT (live, USMCA 2026-08-02 18:41 CT): a vendor bill SAVED and did not post. The poster ran
 * and refused, leaving an honest audit row —
 *   accounting.bill.gl_post_failed / BILL_LINE_ACCOUNT_UNRESOLVED
 *   "Category maintenance/maintenance has no active expense_category_account_map entry"
 * TRANSP had 17 expense-side map rows and TRK 10; USMCA had ZERO. So EVERY USMCA bill failed. It was
 * NOT a missing Finalize/Post feature — bills.service.ts already posts on create and the flag is on.
 *
 * THE SIBLING DEFECT (ROW 259): driver-subaccount-provision.service.ts inserted account_number NULL
 * with the comment "assigned when the account syncs to QBO". USMCA has no QuickBooks connection, so
 * those accounts could never be numbered and every hire minted another NULL. Third instance of the
 * "assumes a QBO mirror exists" class, after the WO vendor lookup (#4048) and the spend-by-vendor join.
 *
 * WHAT IT ENFORCES (static):
 *   A. the seed migration maps every category_kind TRANSP maps, so a new entity is not half-seeded;
 *   B. the sub-account creator derives account_number locally and does NOT insert it as NULL.
 *
 * The DATA assertion (every active entity has >= 1 expense map row) needs a DB and belongs to GUARD's
 * live pass — stated here rather than faked with a green static check.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:entity-expense-category-map-complete";
const MIGRATION = "db/migrations/202611190000_usmca_expense_category_map_and_driver_subaccount_numbering.sql";
const PROVISIONER = "apps/backend/src/accounting/driver-subaccount-provision.service.ts";
const MAINT_POSTER = "apps/backend/src/accounting/maintenance-posting/poster.service.ts";

/** The kinds TRANSP maps on prod — a new entity missing any of these will fail-loud at post time. */
export const REQUIRED_KINDS = [
  "maintenance", "fuel", "toll", "lumper", "driver_pay",
  "cash_advance", "escrow", "insurance", "factoring_fee", "office", "other",
];

/**
 * ACCT-F99 (2026-08-03) — KIND ALONE WAS NOT ENOUGH, and that is why row 666 stayed invisible.
 *
 * The incident in the header failed on `maintenance/maintenance` — kind AND code. This guard only ever
 * asserted that the string 'maintenance' appeared somewhere in the seed, so an entity seeded with
 * `maintenance/tires` and nothing else would have PASSED while every generic maintenance bill failed
 * to post. resolveAccountForCategory() looks up (kind, code) exactly:
 *     WHERE category_kind = $2 AND category_code = $3 AND is_active = true
 * so the (kind, code) PAIR is the real unit of coverage, not the kind.
 *
 * These are the pairs TRANSP carries on prod (verified live 2026-08-03,
 * expense_category_account_map 92/92 rows visible, n_tup_del = 0) MINUS the ones that are dormant:
 * `lumper/lumper_reimbursement_income` is seeded on TRANSP by 202606251700 but has ZERO consumers in
 * apps/backend/src, so requiring it of a new entity would be inventing a GL mapping with no caller.
 * Coverage is asserted for pairs a poster can actually emit — nothing is required on a guess.
 */
export const REQUIRED_PAIRS = [
  ["maintenance", "maintenance"], ["maintenance", "ac"], ["maintenance", "body"],
  ["maintenance", "brakes"], ["maintenance", "dot"], ["maintenance", "electrical"],
  ["maintenance", "engine"], ["maintenance", "misc"], ["maintenance", "pm_preventive"],
  ["maintenance", "tires"],
  ["fuel", "fuel"], ["fuel", "diesel"], ["fuel", "def"], ["fuel", "oil"],
  ["fuel", "misc"], ["fuel", "reefer"],
  ["toll", "toll"],
  ["lumper", "lumper"],
  ["driver_pay", "driver_pay"],
  ["cash_advance", "cash_advance"],
  ["escrow", "escrow"],
  ["insurance", "insurance"],
  ["factoring_fee", "factoring_fee"],
  ["office", "office"],
  ["other", "other"],
];

function stripComments(src) {
  return String(src).replace(/--[^\n]*/g, "");
}

export function analyse(files) {
  const problems = [];
  const mig = files[MIGRATION];
  const prov = files[PROVISIONER];

  if (mig == null) {
    problems.push(`${MIGRATION} is missing — without it USMCA bills fail to post with BILL_LINE_ACCOUNT_UNRESOLVED.`);
  } else {
    const body = stripComments(mig);
    for (const kind of REQUIRED_KINDS) {
      if (!new RegExp(`'${kind}'`).test(body)) {
        problems.push(
          `${MIGRATION}: category_kind '${kind}' is not mapped. TRANSP maps it, so a bill using it ` +
            `will FAIL LOUD at post time with no silent fallback — a half-seeded entity is worse than ` +
            `an unseeded one because the failure only appears on the categories nobody tested.`
        );
      }
    }
  }

  // ACCT-F99 — the (kind, code) PAIR is what resolveAccountForCategory() looks up, and asserting the
  // kind alone is what let `maintenance/maintenance` go missing while 'maintenance' was present.
  //
  // The COVERAGE assertion (does the database actually carry every pair, for every entity) lives in
  // apps/backend/src/accounting/__tests__/expense-category-map-posting-side-coherence.db.test.ts,
  // NOT here — deliberately. A migration may seed pairs from a loop over an ARRAY of codes rather than
  // literal VALUES tuples, and a regex cannot see through that. A static check demanding a particular
  // SQL SHAPE would be enforcing form over substance: it would fail a correct migration and pass an
  // incorrect one that happened to mention the right strings. Only a migrated database can answer
  // "is this pair actually resolvable", so that assertion is made where it can be true.
  //
  // What IS statically provable, and worth proving: the coverage list below must not drift behind the
  // poster. maintenance-posting/poster.service.ts declares the codes it can emit as a union type; if
  // someone adds a tenth code there and not to REQUIRED_PAIRS, the DB test would happily verify an
  // incomplete list and the new code fails loud in production. This ties the two together.
  const poster = files[MAINT_POSTER];
  if (poster == null) {
    problems.push(`${MAINT_POSTER} is missing — cannot verify the maintenance category codes are covered.`);
  } else {
    const decl = /type\s+MaintenanceCategoryCode\s*=\s*([^;]+);/.exec(stripComments(poster));
    if (!decl) {
      problems.push(
        `${MAINT_POSTER}: could not find the MaintenanceCategoryCode union. It is the source of truth ` +
          `for which maintenance codes the poster emits; if it moved, this guard must be repointed ` +
          `rather than left silently unable to check anything.`
      );
    } else {
      const declared = [...decl[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      if (declared.length === 0) {
        problems.push(`${MAINT_POSTER}: MaintenanceCategoryCode union parsed to zero codes — refusing to pass vacuously.`);
      }
      const covered = new Set(REQUIRED_PAIRS.filter(([k]) => k === "maintenance").map(([, c]) => c));
      for (const code of declared) {
        if (!covered.has(code)) {
          problems.push(
            `${MAINT_POSTER} emits maintenance code '${code}' but REQUIRED_PAIRS does not cover it. ` +
              `resolveAccountForCategory matches (kind, code) exactly, so an uncovered code is ` +
              `BILL_LINE_ACCOUNT_UNRESOLVED at post time — the row-666 shape. Add it to REQUIRED_PAIRS ` +
              `AND seed it, do not drop it from the poster.`
          );
        }
      }
    }
  }

  if (prov == null) {
    problems.push(`${PROVISIONER} is missing.`);
  } else {
    const body = stripComments(prov);
    // The INSERT must not hardcode a NULL account_number.
    if (/INSERT INTO catalogs\.accounts[\s\S]{0,900}?VALUES\s*\(\s*NULL\s*,/.test(body)) {
      problems.push(
        `${PROVISIONER}: still inserts account_number as NULL. That assumed QuickBooks would assign it, ` +
          `which is false for any entity without a QBO connection (USMCA) — the account can then NEVER ` +
          `be numbered and every new hire mints another NULL, breaking reconciliation and sorting.`
      );
    }
    if (!/lpad\s*\(/.test(body) || !/account_subtype/.test(body)) {
      problems.push(
        `${PROVISIONER}: no local number derivation (lpad) and/or no account_subtype inheritance. ` +
          `Both must be derived locally — under parallel books TMS is authoritative for its own chart.`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [MIGRATION, PROVISIONER, MAINT_POSTER]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodMig = REQUIRED_KINDS.map((k) => `('${k}','x','1')`).join(",");
  const goodProv = "INSERT INTO catalogs.accounts (...) SELECT p.account_number || lpad(x,3,'0'), p.account_subtype FROM catalogs.accounts p";
  const bugProv = "INSERT INTO catalogs.accounts (a,b) VALUES ( NULL, $1, 'Asset', NULL, $2::uuid )";
  // The REAL declaration shape from maintenance-posting/poster.service.ts.
  const MAINT_CODES = ["tires", "brakes", "engine", "dot", "pm_preventive", "body", "electrical", "ac", "misc"];
  const posterSrc = (codes) => `type MaintenanceCategoryCode = ${codes.map((c) => `"${c}"`).join(" | ")};`;
  const goodPoster = posterSrc(MAINT_CODES);
  const base = { [MIGRATION]: goodMig, [PROVISIONER]: goodProv, [MAINT_POSTER]: goodPoster };

  t("complete map + local numbering + covered poster codes passes", analyse(base).length === 0);
  t("a missing category_kind FAILS",
    analyse({ ...base, [MIGRATION]: goodMig.replace("('maintenance','x','1'),", "") }).length === 1);

  // ACCT-F99 — the row-666 shape, at the layer static analysis CAN see it: the poster gains a code
  // that REQUIRED_PAIRS does not cover, so it would fail loud at post time with nothing red first.
  t("a poster code missing from REQUIRED_PAIRS FAILS",
    analyse({ ...base, [MAINT_POSTER]: posterSrc([...MAINT_CODES, "transmission"]) }).length === 1);
  t("two uncovered poster codes produce two problems (per-instance, not a single lumped failure)",
    analyse({ ...base, [MAINT_POSTER]: posterSrc([...MAINT_CODES, "transmission", "drivetrain"]) }).length === 2);
  t("REQUIRED_PAIRS actually covers every code the real poster declares today",
    MAINT_CODES.every((c) => REQUIRED_PAIRS.some(([k, cc]) => k === "maintenance" && cc === c)));
  t("a moved/renamed union is a FAILURE, not a silent skip",
    analyse({ ...base, [MAINT_POSTER]: "type SomethingElse = \"tires\";" }).length === 1);
  t("an empty union is a FAILURE, not a vacuous pass",
    analyse({ ...base, [MAINT_POSTER]: "type MaintenanceCategoryCode = ;" }).length >= 1);
  t("missing poster file FAILS", analyse({ ...base, [MAINT_POSTER]: null }).length === 1);

  // The REAL pre-fix provisioner.
  t("NULL account_number insert FAILS", analyse({ ...base, [PROVISIONER]: bugProv }).length >= 1);
  t("a comment mentioning the old NULL does not trip it",
    analyse({ ...base, [PROVISIONER]: `-- used to be VALUES ( NULL,\n${goodProv}` }).length === 0);
  t("missing migration FAILS", analyse({ ...base, [MIGRATION]: null }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 11 cases (3 pass-shapes incl. comment-immunity, 8 fail-shapes incl. the row-666 uncovered-poster-code shape, a moved union, and an empty union)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — expense category map complete; sub-account numbering is QBO-independent`);
