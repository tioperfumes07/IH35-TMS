#!/usr/bin/env node
/**
 * FLAG-PARITY-01 guard — no migration or seed may ever ENABLE a QuickBooks write-back flag.
 *
 * Owner law, restated 2026-07-29: "we do not write to quikcbooks anymore, we are parallel tms erp
 * reconciling daily." The three kill-switches below are false on all three entities on prod today and
 * must stay that way. 00_LOCKED_DECISIONS §8.3 and .cursor/rules/13 both record it.
 *
 * This is deliberately STATIC. CI has no prod database, so a runtime check would silently skip and
 * report green; a file-level check runs every time. It scans db/migrations and any seed/backfill
 * script for SQL that sets one of these flags to true.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PROTECTED = ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED", "VOID_QBO_MIRROR_ENABLED"];

/**
 * Strip SQL comments BEFORE any analysis.
 *
 * This is the whole correctness of the guard. The first version split on ";" without stripping
 * comments, so a migration whose HEADER said "NEVER TOUCHED HERE, AND MUST STAY OFF:
 * QBO_JE_PUSH_ENABLED" was reported as ENABLING it — the comment text merged into the next
 * statement. A guard that fails on a correct file is worse than no guard: the natural response is to
 * weaken it, and that is how a real defect gets allowlisted later.
 */
export function stripSqlComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/--[^\n]*/g, " ");            // line comments
}

/** Protected flags this statement sets to TRUE. Empty when it sets them false or only names them. */
export function statementEnables(stmt, flags = PROTECTED) {
  const hits = [];
  for (const flag of flags) {
    if (!stmt.includes(flag)) continue;
    const s = stmt.toLowerCase();
    // Bind the verdict to THIS statement, and require an explicit truthy assignment.
    const setsFalse = /enabled\s*=\s*false/.test(s) || /\bfalse\b/.test(s);
    const setsTrue = /enabled\s*=\s*true/.test(s) || /\btrue\b/.test(s);
    if (setsTrue && !setsFalse) hits.push(flag);
  }
  return hits;
}

/** True when `src` sets one of the protected flags to true, ignoring comments entirely. */
export function enablesWriteback(src, flags = PROTECTED) {
  const clean = stripSqlComments(src);
  const problems = [];
  for (const stmt of clean.split(";")) {
    problems.push(...statementEnables(stmt, flags));
  }
  return [...new Set(problems)];
}

if (process.argv.includes("--selftest")) {
  // Fixtures are REAL-SHAPED: multi-line, comment-bearing, the way migrations actually look.
  // v1 of this guard passed 6/6 on single-line hand-written strings and still produced a FALSE
  // POSITIVE on a real file whose header merely NAMED the flags. Case 1 below is that exact file's
  // shape and is the reason this suite exists.
  const REAL_FALSE_POSITIVE = `
-- Enable QBO projection flags for TRANSP.
--
-- NEVER TOUCHED HERE, AND MUST STAY OFF (parallel books -- we sync FROM QuickBooks and reconcile, we
-- never write back): QBO_JE_PUSH_ENABLED and QBO_ENTITY_PUSH_ENABLED. Verified 0 rows ON at authoring.
--
UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'QBO_AR_PAYMENTS_PROJECTION_ENABLED';
`;
  const REAL_VIOLATION = `
-- Some future migration that actually turns write-back on.
UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'QBO_JE_PUSH_ENABLED';
`;
  const BLOCK_COMMENT_MENTION = `
/* QBO_ENTITY_PUSH_ENABLED must remain false; see 00_LOCKED_DECISIONS 8.3 */
UPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'BILL_GL_POSTING_ENABLED';
`;
  const EXPLICIT_OFF = `
INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled)
VALUES ('QBO_JE_PUSH_ENABLED', '00000000-0000-0000-0000-000000000000', false);
`;
  const cases = [
    { n: "REAL false-positive shape (header names the flags) -> allowed", s: REAL_FALSE_POSITIVE, want: 0 },
    { n: "real violation (sets QBO_JE_PUSH true) -> caught", s: REAL_VIOLATION, want: 1 },
    { n: "block-comment mention + unrelated true -> allowed", s: BLOCK_COMMENT_MENTION, want: 0 },
    { n: "explicit false seed -> allowed", s: EXPLICIT_OFF, want: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = enablesWriteback(c.s).length;
    if (got !== c.want) { console.error(`  selftest FAIL — ${c.n}: expected ${c.want}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.n}`);
  }

  // MUTATION ARM: take a REAL migration off disk, inject one enabling statement, and require a catch.
  // A fixture I wrote proves less than the corpus I actually ship.
  try {
    const real = readdirSync(join(ROOT, "db", "migrations")).filter((f) => f.endsWith(".sql"))[0];
    const src = readFileSync(join(ROOT, "db", "migrations", real), "utf8");
    if (enablesWriteback(src).length !== 0) {
      console.error(`  selftest FAIL — baseline real migration ${real} already flags; mutation proves nothing`);
      bad++;
    } else {
      const mutated = src + "\nUPDATE lib.feature_flag_overrides SET enabled = true WHERE flag_key = 'VOID_QBO_MIRROR_ENABLED';\n";
      if (enablesWriteback(mutated).length === 0) {
        console.error(`  selftest FAIL — mutating real migration ${real} was NOT caught`);
        bad++;
      } else {
        console.log(`  selftest OK — mutating a real migration (${real}) is caught`);
      }
    }
  } catch (err) {
    console.error(`  selftest FAIL — mutation arm could not run: ${err.message}`);
    bad++;
  }

  if (bad) { console.error(`verify-qbo-writeback-flags-never-enabled SELFTEST FAILED — ${bad} case(s)`); process.exit(1); }
  console.log(`verify-qbo-writeback-flags-never-enabled SELFTEST OK — ${cases.length} cases + real-migration mutation arm`);
  process.exit(0);
}

const dir = join(ROOT, "db", "migrations");
if (!existsSync(dir)) { console.error("verify:qbo-writeback-flags-never-enabled FAIL — db/migrations missing"); process.exit(1); }
const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
if (files.length === 0) { console.error("verify:qbo-writeback-flags-never-enabled FAIL — 0 migrations found; refusing to report green"); process.exit(1); }

const offenders = [];
for (const f of files) {
  const hits = enablesWriteback(readFileSync(join(dir, f), "utf8"));
  if (hits.length) offenders.push(`${f}: ${hits.join(", ")}`);
}

if (offenders.length) {
  console.error("verify:qbo-writeback-flags-never-enabled FAIL — a migration ENABLES a QuickBooks write-back flag:");
  for (const o of offenders) console.error(`  ${o}`);
  console.error("\nTMS never writes to QuickBooks (owner 2026-07-29; 00_LOCKED_DECISIONS §8.3).\nThese kill-switches stay false on every entity.");
  process.exit(1);
}
console.log(`verify:qbo-writeback-flags-never-enabled OK — ${files.length} migrations, none enables ${PROTECTED.join("/")}`);
