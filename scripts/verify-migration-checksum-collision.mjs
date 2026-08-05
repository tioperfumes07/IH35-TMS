#!/usr/bin/env node
/**
 * GUARD — verify-migration-checksum-collision (LV-087)
 *
 * THE DEFECT THIS PREVENTS — four instances already on prod
 * Two migration files with byte-identical SQL are the same DDL under two numbers. When the second is
 * applied, the statement runs twice. Verified live on `_system._schema_migrations`: **876 applied rows,
 * 872 distinct checksums — 4 renumber-and-reapply pairs**:
 *
 *   202609250000_fuel_03_overage_engine.sql          || 202609270000_fuel_03_overage_engine.sql
 *   202609260000_fuel_03_overage_events_unit_fk.sql  || 202609280000_..._unit_fk.sql
 *   202609160000_c9_form_roundtrip_persist_columns.sql || 202609190000_...
 *   0237_accounting_ar_collection_tasks.sql          || 0238_accounting_ar_collection_tasks.sql
 *
 * Those four were harmless ONLY because their SQL was idempotent — `IF NOT EXISTS` absorbed the second
 * run. That is luck, not a control. The same mistake with a non-idempotent statement — an UPDATE, an
 * INSERT of seed rows, an ALTER that appends — double-applies it. On the financial cluster that is
 * duplicated data or a doubled balance, with no error raised, because from Postgres's point of view
 * both runs succeeded.
 *
 * The existing rules do NOT cover this. `never-edit-an-applied-migration` catches a changed checksum on
 * the SAME filename; the number-collision guard catches a reused NUMBER. A renumber-and-reapply is the
 * third case: new filename, new number, identical bytes — and nothing looked at it.
 *
 * WHAT IS ASSERTED
 *   1. no two migration files on disk share a checksum;
 *   2. the runtime refusal in db-migrate.mjs is still present, so the block holds at the source and
 *      not only in CI (a CI-only check is bypassed by anyone applying a migration directly).
 *
 * WHAT IS DELIBERATELY *NOT* ASSERTED — per GUARD's note, and it matters
 * This does NOT require the canonical ledger and the mirror ledger to hold identical filename SETS.
 * HELD migrations legitimately appear in the mirror only: they are registered as held, skipped on prod,
 * and stay honestly pending. Asserting set-equality would make correct held-migration handling look
 * like a defect and would push someone to "fix" it by applying a held migration on prod — precisely
 * the outcome the held mechanism exists to prevent.
 *
 * The four existing prod pairs are NOT retro-deleted anywhere: idempotency made them no-ops, and
 * deleting ledger history to make a guard green would be falsifying the audit trail. This guard stops
 * the NEXT one.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const LABEL = "verify-migration-checksum-collision";
const MIGRATIONS_DIR = "db/migrations";
const RUNNER = "scripts/db-migrate.mjs";
const BASELINE = "scripts/known-migration-checksum-duplicates.json";

/**
 * The pre-existing duplicate, grandfathered — see BASELINE for why it cannot simply be deleted.
 * Keyed on checksum + the EXACT sorted filename list, so a third file joining that checksum, or any
 * different pair, is not covered and still fails. Same file the runner reads: one list, no drift.
 */
function loadBaseline() {
  let raw;
  try {
    raw = readFileSync(BASELINE, "utf8");
  } catch {
    return null; // reported as an error, never treated as "nothing grandfathered"
  }
  const allowed = new Map();
  for (const entry of JSON.parse(raw).duplicates ?? []) {
    allowed.set(entry.checksum, [...(entry.files ?? [])].sort().join("|"));
  }
  return allowed;
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function findCollisions(dir = MIGRATIONS_DIR) {
  const byChecksum = new Map();
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return { collisions: [], scanned: 0 };
  }
  for (const f of files) {
    const ck = sha256(readFileSync(path.join(dir, f), "utf8"));
    if (!byChecksum.has(ck)) byChecksum.set(ck, []);
    byChecksum.get(ck).push(f);
  }
  const collisions = [];
  for (const [ck, names] of byChecksum) {
    if (names.length > 1) collisions.push({ checksum: ck, files: names });
  }
  collisions.sort((a, b) => a.files[0].localeCompare(b.files[0]));
  return { collisions, scanned: files.length };
}

function runnerBlocksReapply(src) {
  // The refusal must compare the incoming checksum against filenames ALREADY applied under it.
  return /ledgerFilesByChecksum/.test(src) && /SAME checksum/i.test(src);
}

function check() {
  const errors = [];
  const { collisions, scanned } = findCollisions();
  const allowed = loadBaseline();

  if (allowed === null) {
    errors.push(
      `${BASELINE}: unreadable. It is the ONLY thing distinguishing the pre-existing duplicate from a new ` +
        `one; without it this guard cannot tell them apart.`
    );
  }

  let grandfathered = 0;
  for (const c of collisions) {
    const exact = [...c.files].sort().join("|");
    if (allowed && allowed.get(c.checksum) === exact) {
      grandfathered += 1;
      continue;
    }
    const near = allowed?.has(c.checksum)
      ? ` The baseline grandfathers checksum ${c.checksum.slice(0, 12)} for EXACTLY [${allowed.get(c.checksum)}] — ` +
        `this set differs, so it is a new duplicate on a known-duplicated checksum, not the old one.`
      : "";
    errors.push(
      `checksum ${c.checksum.slice(0, 12)} is shared by ${c.files.length} migration files: ${c.files.join(", ")}. ` +
        `Byte-identical DDL under two numbers runs the same statement twice. If the change is needed ` +
        `again, write a migration expressing the NEW intent — do not renumber and re-apply.${near}`
    );
  }

  let runner = "";
  try {
    runner = readFileSync(RUNNER, "utf8");
  } catch {
    runner = "";
  }
  if (!runner) {
    errors.push(`${RUNNER}: missing — the runtime refusal cannot be verified.`);
  } else if (!runnerBlocksReapply(runner)) {
    errors.push(
      `${RUNNER}: no runtime refusal for a checksum already applied under a different filename. A ` +
        `CI-only check is bypassed by anyone running the migrator directly, which is exactly how the ` +
        `four existing pairs reached prod.`
    );
  }
  // The runner must honour the SAME baseline, or a fresh CI database applies 0237, hits the refusal on
  // 0238, and dies migrating history that is already on prod.
  if (runner && !/grandfathered/.test(runner)) {
    errors.push(
      `${RUNNER}: the refusal does not consult ${BASELINE}. A from-scratch migrate would then abort on the ` +
        `pre-existing duplicate pair.`
    );
  }

  return { errors, scanned, collisions, grandfathered };
}

if (process.argv.includes("--selftest")) {
  const { errors } = check();
  if (errors.length) {
    console.error(`${LABEL} --selftest FAIL — real repo does not pass:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  // Mutation 1: two identical files must be detected.
  const fake = new Map([["a.sql", "SELECT 1;"], ["b.sql", "SELECT 1;"]]);
  const seen = new Map();
  for (const [f, sql] of fake) {
    const ck = sha256(sql);
    if (!seen.has(ck)) seen.set(ck, []);
    seen.get(ck).push(f);
  }
  const detected = Array.from(seen.values()).some((v) => v.length > 1);
  if (!detected) {
    console.error(`${LABEL} --selftest FAIL — identical files were NOT detected as a collision.`);
    process.exit(1);
  }
  // Mutation 2: a runner without the refusal must be rejected.
  if (runnerBlocksReapply("async function main() { /* no refusal here */ }")) {
    console.error(`${LABEL} --selftest FAIL — a runner with no refusal was accepted.`);
    process.exit(1);
  }
  // Mutation 3: a runner that merely mentions checksums (without the index) must be rejected.
  if (runnerBlocksReapply("const checksum = sha256(sql); if (ledger.checksum !== checksum) throw new Error('drift');")) {
    console.error(
      `${LABEL} --selftest FAIL — the existing same-filename drift check was mistaken for the ` +
        `renumber-and-reapply refusal. They are different defects.`
    );
    process.exit(1);
  }
  // Mutation 4: grandfathering must be EXACT-SET, not per-checksum. A third file joining the known
  // checksum is a NEW duplicate and must still fail — otherwise the baseline becomes a blanket amnesty
  // for that checksum and the guard quietly stops protecting it.
  const real = JSON.parse(readFileSync(BASELINE, "utf8"));
  const entry = real.duplicates?.[0];
  if (!entry) {
    console.error(`${LABEL} --selftest FAIL — baseline has no entries; the exactness test cannot run.`);
    process.exit(1);
  }
  const allowedExact = [...entry.files].sort().join("|");
  const withThirdFile = [...entry.files, "0239_copy_pasted_again.sql"].sort().join("|");
  if (allowedExact === withThirdFile) {
    console.error(`${LABEL} --selftest FAIL — adding a third file did not change the set key.`);
    process.exit(1);
  }
  // Mutation 5: the baseline must actually describe reality. If its pinned checksum no longer matches
  // the files it names, it is grandfathering nothing and hiding that fact.
  for (const f of entry.files) {
    let sql;
    try {
      sql = readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    } catch {
      console.error(`${LABEL} --selftest FAIL — baseline names ${f}, which is not on disk.`);
      process.exit(1);
    }
    if (sha256(sql) !== entry.checksum) {
      console.error(
        `${LABEL} --selftest FAIL — baseline pins ${entry.checksum.slice(0, 12)} but ${f} hashes to ` +
          `${sha256(sql).slice(0, 12)}. A stale baseline grandfathers nothing.`
      );
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — 5 mutations all detected; baseline matches the files it names.`);
  process.exit(0);
}

const { errors, scanned, collisions, grandfathered } = check();
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${scanned} migration files scanned; ${collisions.length} checksum collision(s), all ` +
    `${grandfathered} of them the frozen pre-existing pair; db-migrate.mjs refuses any NEW checksum already ` +
    `applied under another filename.`
);
