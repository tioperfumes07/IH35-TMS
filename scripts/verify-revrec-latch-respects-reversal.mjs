#!/usr/bin/env node
/**
 * ACCT-F66 — every read of the revenue-recognition latch must require that the journal entry it
 * recorded still STANDS (not voided, not reversed).
 *
 * WHY THIS EXISTS (prod br-fancy-credit-akjnd07a, 2026-08-01):
 * accounting.load_revenue_recognition_postings is INSERT-only in practice — nothing ever set
 * is_active=false, though the table ships is_active / voided_at / voided_by_user_id and ih35_app
 * holds UPDATE but NOT DELETE. The two owner-authorized reversals for load L-20260624-0083 zeroed
 * the GL (net 0 across 1240 Unbilled, 4100 Freight Revenue, QBO-45 A/R) yet BOTH subledger rows
 * stayed is_active=true, status='posted', while their journal entries carry
 * reversed_by_je_id = a5123c01-… / 363f13ae-….
 *
 * Reading a reversed latch as standing breaks three things, each silently:
 *   - loadLatchExists() -> Event 1 refuses with "already_posted", so a load whose recognition was
 *     reversed can NEVER re-recognize. If the delivery is later genuinely evidenced the revenue is
 *     simply lost, with no error anyone sees.
 *   - earnAmountCents() -> Event 2 would bill against a reversed Event 1 amount.
 *   - the ACCT-F59 invoice interlock -> that load's invoice is refused forever.
 *
 * ONE DEPENDENCY-FREE DEFINITION, EXPORTED. The reversal test lives in the standing-predicate leaf
 * and every caller imports it. This repo has already shipped a load state machine in three copies and a delivery-
 * evidence rule in two; a second private copy of "is this latch still good" is the same failure
 * waiting to happen, so the guard fails if any file open-codes it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const POSTER = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";
const PREDICATE = "apps/backend/src/accounting/revrec-delivery-posting/standing-latch-predicate.ts";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const LABEL = "verify-revrec-latch-respects-reversal";
const TABLE = "load_revenue_recognition_postings";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every SQL block that reads the latch AND filters is_active must apply the standing-JE predicate. */
export function auditLatchReads(src, rel) {
  const code = stripComments(src);
  const problems = [];
  for (const m of code.matchAll(/`([^`]*?load_revenue_recognition_postings[^`]*?)`/g)) {
    const sql = m[1];
    if (!/\bis_active\b/.test(sql)) continue; // not an "is this latch live" read
    if (/INSERT\s+INTO/i.test(sql)) continue; // the write path is not a read
    if (!/STANDING_LATCH_JE_PREDICATE|standingLatchJePredicate/.test(sql)) {
      problems.push(
        `${rel}: a read of ${TABLE} filters is_active but does not apply STANDING_LATCH_JE_PREDICATE. ` +
          `A latch whose journal entry was reversed is NOT standing — treating it as live blocks the ` +
          `load from ever re-recognizing and blocks its invoice forever.`
      );
    }
  }
  return problems;
}

/** The predicate must be defined exactly once in its dependency-free leaf and preserve every standing-JE condition. */
export function auditSingleDefinition(predicateSrc, posterSrc, engineSrc) {
  const problems = [];
  const predicate = stripComments(predicateSrc);
  const poster = stripComments(posterSrc);
  const engine = stripComments(engineSrc);
  if (!/export\s+function\s+standingLatchJePredicate/.test(predicate)) {
    problems.push(`${PREDICATE}: STANDING_LATCH_JE_PREDICATE is not defined and exported — the reversal test has no dependency-free home.`);
  }
  for (const [token, label] of [
    ["je.id = ${alias}.journal_entry_id", "journal-entry identity"],
    ["je.operating_company_id = ${alias}.operating_company_id", "operating-company identity"],
    ["je.voided_at IS NULL", "void exclusion"],
    ["je.reversed_by_je_id IS NULL", "reversal exclusion"],
  ]) {
    if (!predicate.includes(token)) problems.push(`${PREDICATE}: missing ${label} from the canonical standing-JE predicate.`);
  }
  if (/function\s+standingLatchJePredicate/.test(poster) || /function\s+standingLatchJePredicate/.test(engine)) {
    problems.push(`poster/engine defines its own STANDING_LATCH_JE_PREDICATE. Import the predicate leaf — two copies drift.`);
  }
  if (!/from\s+["']\.\/revrec-delivery-posting\/standing-latch-predicate\.js["']/.test(engine)) {
    problems.push(`${ENGINE}: must import the standing predicate from its dependency-free leaf, never the full revrec poster.`);
  }
  if (/from\s+["']\.\/revrec-delivery-posting\/poster\.service\.js["']/.test(engine)) {
    problems.push(`${ENGINE}: imports the full revrec poster and recreates the journal-entries → posting-engine → poster cycle.`);
  }
  if (/reversed_by_je_id/.test(engine) && !/STANDING_LATCH_JE_PREDICATE/.test(engine)) {
    problems.push(`${ENGINE}: open-codes a reversed_by_je_id test instead of importing the shared predicate.`);
  }
  return problems;
}

/**
 * Scan EVERY backend source file, not a hand-picked list. The first version of this guard checked
 * only the poster and the posting engine — the two files I happened to be editing — and therefore
 * passed while accounting/revenue-leakage.service.ts carried FIVE more unguarded latch reads that
 * still reported a reversed load as earned-and-billed. A guard that only inspects the files its
 * author remembered is the same failure as verify-auto-status-no-direct-status-write, which was green
 * while the real offender sat one directory away. The class is "every read of this table"; the guard
 * must enumerate the class itself.
 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function auditTree() {
  const problems = [];
  for (const full of walk(join(ROOT, "apps/backend/src"))) {
    const rel = relative(ROOT, full);
    const src = readFileSync(full, "utf8");
    if (!src.includes(TABLE)) continue;
    problems.push(...auditLatchReads(src, rel));
  }
  const poster = readFileSync(join(ROOT, POSTER), "utf8");
  const predicate = readFileSync(join(ROOT, PREDICATE), "utf8");
  const engine = readFileSync(join(ROOT, ENGINE), "utf8");
  problems.push(...auditSingleDefinition(predicate, poster, engine));
  return problems;
}

function selftest() {
  const failures = [];
  const bare = "const q = `SELECT id FROM accounting.load_revenue_recognition_postings WHERE load_id = $1 AND is_active LIMIT 1`;";
  if (auditLatchReads(bare, "x.ts").length === 0) failures.push("case1 FAIL — an is_active read with no standing-JE predicate was NOT caught");

  const fixed = "const q = `SELECT p.id FROM accounting.load_revenue_recognition_postings p WHERE p.load_id = $1 AND p.is_active AND ${STANDING_LATCH_JE_PREDICATE} LIMIT 1`;";
  if (auditLatchReads(fixed, "x.ts").length !== 0) failures.push("case2 FAIL — the fixed read was flagged");

  const insert = "const q = `INSERT INTO accounting.load_revenue_recognition_postings (load_id, is_active) VALUES ($1, true)`;";
  if (auditLatchReads(insert, "x.ts").length !== 0) failures.push("case3 FAIL — the INSERT path was flagged as a read");

  const leaf = "export function standingLatchJePredicate(alias) { return `je.id = ${alias}.journal_entry_id AND je.operating_company_id = ${alias}.operating_company_id AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL`; }";
  const engineImport = 'import { STANDING_LATCH_JE_PREDICATE } from "./revrec-delivery-posting/standing-latch-predicate.js";';
  if (auditSingleDefinition("const x = 1;", "", engineImport).length === 0) failures.push("case4 FAIL — a missing exported predicate was NOT caught");
  if (!auditSingleDefinition(leaf, "", engineImport + "\nfunction standingLatchJePredicate(a) { return ''; }").some((p) => p.includes("defines its own")))
    failures.push("case5 FAIL — a duplicate predicate definition was NOT caught");
  if (!auditSingleDefinition(leaf, "", 'import { STANDING_LATCH_JE_PREDICATE } from "./revrec-delivery-posting/poster.service.js";').some((p) => p.includes("full revrec poster")))
    failures.push("case6 FAIL — the circular full-poster import was NOT caught");
  if (!auditSingleDefinition(leaf.replace("je.reversed_by_je_id IS NULL", "TRUE"), "", engineImport).some((p) => p.includes("reversal exclusion")))
    failures.push("case7 FAIL — removal of the reversal exclusion was NOT caught");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case8 FAIL — real sources flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — bare is_active read caught, fixed read clean, INSERT ignored, duplicate definition caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every latch read requires a standing journal entry, from one shared definition`);
}

main();
