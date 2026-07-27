#!/usr/bin/env node
/**
 * verify-driver-recovery-policy-single-vocabulary
 *
 * THE DEFECT THIS PINS. "Where does a driver recovery come from" is one money decision, and this
 * system already had a locked answer: insurance.claim.recovery_rail, owner lock #1 (2026-07-22),
 * CHECK (recovery_rail IN ('escrow','settlement','split','ask')) DEFAULT 'ask' — applied on prod via
 * 202607730000 and read live from pg_constraint on br-fancy-credit-akjnd07a 2026-07-27, so the lock is
 * real in the database and not merely asserted in TypeScript. While building the driver-side policy
 * catalog, the first draft of 202609300000 introduced a SECOND vocabulary for the same decision —
 * ('pay_first','escrow_first','ask_only'). Nothing would have failed: both sets are internally valid,
 * both would have applied cleanly. It would simply have meant that one day a claim says 'settlement'
 * and a deduction type says 'pay_first' and a human has to know those are the same thing. That is the
 * C13 defect class — a money control that cannot be joined, compared, or constrained across the system.
 *
 * WHY THIS GUARD DERIVES INSTEAD OF PINNING. A guard that hardcoded the four words would pass while a
 * future owner change to the lock silently split the vocabularies again — the exact failure recorded in
 * [[guards-that-assert-the-defect]], where 8 guards pinned a buggy literal and certified it. So the
 * expected set is PARSED from the owner-locked declaration in claim.shared.ts and compared to the CHECK
 * constraint in the migration. Change the lock in one place and this guard demands the other follow.
 * It enforces the INVARIANT (one vocabulary), not a snapshot of today's words.
 *
 * Usage: node scripts/verify-driver-recovery-policy-single-vocabulary.mjs [--selftest]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const CLAIM_SHARED = "apps/backend/src/insurance/claim.shared.ts";
const MIGRATION = "db/migrations/202609310000_driver_deduction_type_recovery_policy.sql";
const MIGRATIONS_DIR = "db/migrations";

/** Words that were considered and rejected. Their reappearance IS the regression. */
export const REJECTED_DIALECT = ["pay_first", "escrow_first", "ask_only"];

/** Parse the owner-locked rail values from their single declaration site. */
export function lockedRailValues(claimSharedSrc) {
  const m = claimSharedSrc.match(/INSURANCE_CLAIM_RECOVERY_RAIL_VALUES\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter(Boolean);
}

/** Parse the value set out of the migration's rail CHECK constraint. */
export function migrationRailValues(sql) {
  const m = sql.match(/CHECK\s*\(\s*default_recovery_rail\s+IN\s*\(([^)]*)\)/i);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

export function policyProblems(sql, locked) {
  const out = [];

  const rails = migrationRailValues(sql);
  if (!rails) {
    out.push("migration has no CHECK (default_recovery_rail IN (...)) — an unconstrained text column deciding whether escrow may be drawn is not a money control");
  } else if (locked && (rails.length !== locked.length || !locked.every((v) => rails.includes(v)))) {
    out.push(
      `recovery-rail vocabulary SPLIT: migration allows [${rails.join(", ")}] but the owner lock in claim.shared.ts is [${locked.join(", ")}] — one decision must not have two dialects; change both together or neither`
    );
  }

  // Restrictive defaults. A permissive default would silently authorise escrow draws on rows that
  // predate this migration (3 live INS-DED rows on prod, one per entity).
  if (!/may_draw_escrow\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(sql)) {
    out.push("may_draw_escrow does not default to false — pre-existing deduction types would inherit permission to draw driver escrow");
  }
  if (!/default_recovery_rail\s+text\s+NOT NULL\s+DEFAULT\s+'ask'/i.test(sql)) {
    out.push("default_recovery_rail does not default to 'ask' — DoD §8 requires the operator be asked, so the neutral value is the only safe default");
  }
  if (!/survives_separation\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(sql)) {
    out.push("survives_separation does not default to false");
  }

  // Coherence: cannot pre-select an escrow-touching rail while forbidding escrow.
  if (!/ck_driver_deduction_types_escrow_rail_coherent/.test(sql)) {
    out.push("no coherence constraint — may_draw_escrow=false alongside rail 'escrow'/'split' would be storable, offering a pre-selected option the policy forbids");
  }

  // The three situations the owner named, each with the rail its situation forces.
  const expectedSeeds = [
    ["ABANDONMENT", "escrow", "no future settlement exists, so escrow is the only source"],
    ["DAMAGE", "split", "settlement first, escrow covers only the shortfall (§9.3)"],
    ["SAFETY-FINE", "settlement", "settlement first while employed; survives separation"],
  ];
  for (const [code, rail, why] of expectedSeeds) {
    const row = sql.match(new RegExp(`\\['${code}'[^\\]]*?\\]`, "s"));
    if (!row) {
      out.push(`recovery situation '${code}' is not seeded — ${why}`);
    } else if (!new RegExp(`'${rail}'`).test(row[0])) {
      out.push(`recovery situation '${code}' is not seeded with rail '${rail}' — ${why}`);
    }
  }

  return out;
}

/** The rejected dialect must not reappear anywhere in db/migrations. */
export function dialectLeakProblems(files) {
  const out = [];
  for (const { path, sql } of files) {
    // The corrected migration NAMES the rejected words in its own explanation of why they were
    // rejected. Quoted SQL literals are the regression; prose in a comment is the documentation.
    const bare = sql.replace(/--[^\n]*/g, " ");
    for (const word of REJECTED_DIALECT) {
      if (new RegExp(`'${word}'`).test(bare)) {
        out.push(`${path} contains the rejected rail literal '${word}' — the recovery-rail vocabulary is ('escrow','settlement','split','ask'); a second dialect makes the two sides unjoinable`);
      }
    }
  }
  return out;
}

function read(p) {
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${p} not found — if it moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return readFileSync(abs, "utf8");
}

function allMigrations() {
  const dir = resolve(process.cwd(), MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ path: `${MIGRATIONS_DIR}/${f}`, sql: readFileSync(join(dir, f), "utf8") }));
}

function run() {
  const locked = lockedRailValues(read(CLAIM_SHARED));
  const problems = [];
  if (!locked) {
    problems.push(`${CLAIM_SHARED} no longer declares INSURANCE_CLAIM_RECOVERY_RAIL_VALUES — this guard derives the expected vocabulary from it; repoint the guard rather than dropping the check`);
  }
  problems.push(...policyProblems(read(MIGRATION), locked), ...dialectLeakProblems(allMigrations()));

  if (problems.length) {
    console.error(`[verify-driver-recovery-policy-single-vocabulary] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(
    `[verify-driver-recovery-policy-single-vocabulary] OK — driver recovery policy speaks the owner-locked rail vocabulary [${locked.join(", ")}], defaults are restrictive, escrow permission is coherent with the pre-selected rail, and the 3 owner-named situations are seeded`
  );
  return true;
}

function selftest() {
  let ok = true;
  const locked = lockedRailValues(read(CLAIM_SHARED));
  const real = read(MIGRATION);

  if (!locked || locked.length !== 4) {
    console.error(`SELFTEST FAIL: could not parse the owner lock from ${CLAIM_SHARED} (got ${JSON.stringify(locked)})`);
    ok = false;
  } else {
    console.log(`SELFTEST: derived owner lock = [${locked.join(", ")}]`);
  }

  if (policyProblems(real, locked).length || dialectLeakProblems(allMigrations()).length) {
    console.error("SELFTEST FAIL: the real corrected migration is flagged — false positive");
    ok = false;
  } else {
    console.log("SELFTEST: corrected migration not flagged — OK");
  }

  // Each case MUTATES the real migration, so a selftest cannot pass against a fixture that drifted
  // away from the source it claims to protect.
  const cases = [
    ["the original vocabulary split", real.replace(/'escrow', 'settlement', 'split', 'ask'/, "'pay_first', 'escrow_first', 'ask_only'"), true],
    ["permissive escrow default", real.replace(/may_draw_escrow\s+boolean NOT NULL DEFAULT false/, "may_draw_escrow       boolean NOT NULL DEFAULT true"), true],
    // Must target the COLUMN DEFINITION, not the first textual "DEFAULT 'ask'" — the header comment
    // quotes insurance.claim's default, and mutating prose proves nothing about the schema.
    ["non-neutral rail default", real.replace(/(default_recovery_rail\s+text\s+NOT NULL\s+DEFAULT\s+)'ask'/, "$1'escrow'"), true],
    ["coherence constraint dropped", real.replace(/ck_driver_deduction_types_escrow_rail_coherent/g, "ck_removed"), true],
    ["abandonment forced onto settlement", real.replace(/\['ABANDONMENT','Load abandonment \/ walkoff','true','escrow'/, "['ABANDONMENT','Load abandonment / walkoff','true','settlement'"), true],
    ["untouched migration", real, false],
  ];
  for (const [name, sql, shouldFlag] of cases) {
    if (sql === real && shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' did not mutate the source — the case cannot fail, so it proves nothing`);
      ok = false;
      continue;
    }
    const flagged = policyProblems(sql, locked).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  // Prove the dialect-leak limb can fail too.
  const leak = dialectLeakProblems([{ path: "db/migrations/fixture.sql", sql: "CHECK (rail IN ('escrow_first'))" }]);
  if (!leak.length) {
    console.error("SELFTEST FAIL: dialect-leak limb did not flag a reintroduced 'escrow_first' literal");
    ok = false;
  } else {
    console.log("SELFTEST: dialect-leak limb flags a reintroduced literal — OK");
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
