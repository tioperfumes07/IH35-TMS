#!/usr/bin/env node
/**
 * GUARD: a backfill into catalogs.items may only insert item_types the table's CHECK accepts.
 *
 * ROOT CAUSE it exists for (2026-07-25): migration 202607950000 backfilled TRK's items from
 * mdata.qbo_items and copied EVERY mirror row — including QBO 'Category' (28 rows) and 'Group' (1),
 * which are QBO grouping nodes, not items. catalogs.items carries
 *   CHECK item_type IN ('Service','Inventory','NonInventory','Bundle','Discount','Charge')
 * so those rows raise a CHECK violation and abort the entire backfill on prod.
 *
 * WHY CI MISSED IT — the gap this guard closes: the migration ran green on a fresh from-0001 CI
 * database whose seed contains NO Category rows. CI did not reflect prod, so "migration applies
 * cleanly" was true in CI and false on prod. A guard that only re-ran the migration would have
 * missed it again; this one compares the backfill's allowlist against the CHECK itself and proves
 * the predicate excludes the offending types.
 *
 * Substance, not shape: it derives the allowed set from the CREATE TABLE CHECK (0010_catalogs_init)
 * rather than trusting a list typed here, then asserts the backfill's predicate is a subset of it
 * and is applied in BOTH the INSERT and the verification subquery.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-items-backfill-type-allowlist";
const CHECK_SOURCE = "db/migrations/0010_catalogs_init.sql";
const BACKFILL = "db/migrations/202607950000_catalogs_items_backfill_from_qbo_mirror.sql";

/** Types present in the QBO mirror that catalogs.items must never receive (prod-verified 2026-07-25). */
export const MIRROR_PSEUDO_TYPES = ["Category", "Group"];

/** Pull the allowed item_type set out of the CREATE TABLE CHECK — never a list typed into this guard. */
export function parseCheckAllowlist(createSource) {
  const idx = createSource.indexOf("item_type text NOT NULL CHECK");
  if (idx === -1) return null;
  const window = createSource.slice(idx, idx + 400);
  const values = [...window.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  return values.length ? [...new Set(values)] : null;
}

/** Every `item_type IN (...)` predicate in the backfill, as arrays of literals. */
export function parseBackfillPredicates(backfillSource) {
  const code = backfillSource
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  return [...code.matchAll(/item_type\s+IN\s*\(([^)]*)\)/gi)].map((m) =>
    [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1])
  );
}

export function assertBackfillAllowlist(createSource, backfillSource) {
  const problems = [];
  const allowed = parseCheckAllowlist(createSource);
  if (!allowed) {
    problems.push(`${CHECK_SOURCE}: could not parse the catalogs.items item_type CHECK — did the DDL move?`);
    return problems;
  }

  const predicates = parseBackfillPredicates(backfillSource);
  // Both the INSERT and the verification subquery must filter; otherwise the gap check counts
  // pseudo-items and can pass while the insert set is wrong (or vice-versa).
  if (predicates.length < 2) {
    problems.push(
      `${BACKFILL}: found ${predicates.length} item_type allowlist predicate(s); expected at least 2 ` +
        `(the INSERT ... WHERE and the verification subquery). A backfill that filters in only one ` +
        `place can still insert a type the CHECK rejects, or mis-count the gap.`
    );
  }

  predicates.forEach((types, i) => {
    const illegal = types.filter((t) => !allowed.includes(t));
    if (illegal.length) {
      problems.push(
        `${BACKFILL}: predicate #${i + 1} permits item_type(s) the catalogs.items CHECK rejects: ` +
          `${illegal.join(", ")}. Allowed: ${allowed.join(", ")}.`
      );
    }
    // BEHAVIOURAL: the predicate must actually exclude the pseudo-types that exist in the mirror.
    const leaked = MIRROR_PSEUDO_TYPES.filter((t) => types.includes(t));
    if (leaked.length) {
      problems.push(
        `${BACKFILL}: predicate #${i + 1} would copy QBO pseudo-item type(s) ${leaked.join(", ")} ` +
          `into catalogs.items. These are QBO grouping nodes, not items, and abort the backfill.`
      );
    }
  });

  return problems;
}

/** Behavioural fixture: apply a predicate to mirror rows the way the SQL would. */
export function simulateBackfill(rows, allowedTypes) {
  return rows.filter((r) => allowedTypes.includes(r.item_type));
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (IS_MAIN && process.argv.includes("--selftest")) {
  const failures = [];
  const createSrc = read(CHECK_SOURCE);
  const backfillSrc = read(BACKFILL);

  // --- BEHAVIOURAL FIXTURE: prod's actual mirror shape, including the rows that broke it. ---
  // mdata.qbo_items on br-fancy-credit-akjnd07a 2026-07-25: Service 176, Category 28, NonInventory 22,
  // Group 1, Inventory 1.
  const MIRROR_FIXTURE = [
    { name: "Linehaul", item_type: "Service" },
    { name: "Fuel Surcharge", item_type: "NonInventory" },
    { name: "Brake Pad", item_type: "Inventory" },
    { name: "Freight Income", item_type: "Category" }, // <-- the row that aborted the backfill
    { name: "Bundled Ops", item_type: "Group" }, // <-- also rejected by the CHECK
  ];
  const allowed = parseCheckAllowlist(createSrc) ?? [];
  const kept = simulateBackfill(MIRROR_FIXTURE, allowed);
  if (kept.some((r) => r.item_type === "Category")) {
    failures.push("fixture: a Category row survived the allowlist — the backfill would still abort on prod");
  }
  if (kept.some((r) => r.item_type === "Group")) {
    failures.push("fixture: a Group row survived the allowlist");
  }
  if (kept.length !== 3) {
    failures.push(`fixture: expected 3 real items to survive, got ${kept.length}`);
  }
  // And the corrected migration's own predicate must produce the same result.
  const [firstPredicate] = parseBackfillPredicates(backfillSrc);
  if (!firstPredicate) {
    failures.push("fixture: the migration has no item_type allowlist predicate to simulate");
  } else if (simulateBackfill(MIRROR_FIXTURE, firstPredicate).length !== 3) {
    failures.push("fixture: the migration's own predicate does not exclude Category/Group");
  }

  // --- MUTATION CASES against the REAL migration source. ---
  const mutate = (name, fn, needle) => {
    const mutated = fn(backfillSrc);
    if (mutated === backfillSrc) {
      failures.push(`${name}: mutation did not change the source — INERT case`);
      return;
    }
    if (!assertBackfillAllowlist(createSrc, mutated).some((p) => p.includes(needle))) {
      failures.push(`${name}: planted defect NOT caught (expected "${needle}")`);
    }
  };
  // The exact pre-fix defect: no allowlist at all.
  mutate("no-allowlist", (s) => s.replace(/\s*AND q\.item_type IN \([^)]*\)/g, ""), "expected at least 2");
  // Allowlist present but permits Category — the thing that broke prod.
  mutate(
    "category-permitted",
    (s) => s.replace(/'Service','Inventory'/g, "'Service','Category','Inventory'"),
    "QBO pseudo-item type(s) Category"
  );
  // Filtering in only one place.
  mutate("only-one-predicate", (s) => s.replace(/\n    WHERE q\.item_type IN \([^)]*\)/, ""), "expected at least 2");

  // The corrected shape must NOT be flagged.
  const clean = assertBackfillAllowlist(createSrc, backfillSrc);
  if (clean.length) failures.push(`false positive on the corrected migration: ${clean.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — Category/Group fixture rows are skipped, 3 defects planted in the REAL ` +
      `migration caught, corrected migration not flagged`
  );
  process.exit(0);
}

if (IS_MAIN) {
  for (const rel of [CHECK_SOURCE, BACKFILL]) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.log(`${LABEL} OK (skipped — ${rel} not present)`);
      process.exit(0);
    }
  }
  const problems = assertBackfillAllowlist(read(CHECK_SOURCE), read(BACKFILL));
  if (problems.length) {
    console.error(`${LABEL} FAILED — the items backfill can insert a type the CHECK rejects:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — backfill allowlist is a subset of the catalogs.items CHECK and excludes QBO pseudo-items`);
}
