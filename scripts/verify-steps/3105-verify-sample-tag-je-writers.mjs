#!/usr/bin/env node
/**
 * ACCT-F353 stage 2 — sample-tag writer sweep, journal_entries.
 *
 * Tracing the ~10 direct `INSERT INTO accounting.journal_entries` sites (the canonical poster in
 * posting-engine.service.ts, and everything that writes a JE header outside it) found the picture was
 * better than feared: `journal-entries.service.ts` (the manual-JE API), `void.service.ts` (reversals),
 * `settlement-posting/settlement-posting.service.ts` (ACCT-F213), and `posting-engine.service.ts`
 * itself (ACCT-F212) were ALL already correctly deriving `is_sample_data` from a source that carries
 * it. The real stage-2 gap was 5 remaining writers whose source documents genuinely have NO
 * is_sample_data column to derive from at all (verified against a full live column census —
 * `fuel.*`, `accounting.prepaid_assets`, `banking.bank_transactions`, and a manual recurring-JE
 * template carry no such flag anywhere in the schema).
 *
 * FIX: those 5 now write `is_sample_data = false` EXPLICITLY, matching the policy
 * `posting-engine.service.ts`'s ACCT-F212 already established: "everything else returns false rather
 * than guessing — inventing one would be fabricating a financial classification." An explicit,
 * documented false is structurally different from a silently omitted column — the omission is what
 * let `LV-SAMPLE-TAG-DISPATCH-HOLE` and this whole finding happen; an explicit false is a decision
 * that shows up in a diff and can be revisited if the schema ever grows the column.
 *
 * `banking/manual-je.routes.deprecated.ts` is deliberately OUT OF SCOPE — it is unmounted, retired,
 * and writes to a different, nonexistent table; touching it would violate its own "Do NOT re-register"
 * directive.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): each of the 5 files'
 * OWN `INSERT INTO accounting.journal_entries (...)` column-list references `is_sample_data`.
 *
 * Self-test: node scripts/verify-steps/3105-verify-sample-tag-je-writers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3105-verify-sample-tag-je-writers";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const WRITERS = [
  "apps/backend/src/accounting/recurring.worker.ts",
  "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
  "apps/backend/src/accounting/fuel-posting/poster.service.ts",
  "apps/backend/src/accounting/period-close-retained-earnings.service.ts",
  "apps/backend/src/accounting/bank-recon/match.service.ts",
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

export function findInsertColumnLists(src) {
  const code = stripComments(src);
  const lists = [];
  const anchor = /INSERT INTO accounting\.journal_entries\s*\(?/g;
  let m;
  while ((m = anchor.exec(code))) {
    // Two call shapes exist in this codebase: `journal_entries (\n cols \n)` and
    // `journal_entries\n  (cols)` (no space before the paren) — normalize by finding the NEXT "(" if
    // the anchor itself didn't include one.
    let start = m.index + m[0].length;
    if (!m[0].trimEnd().endsWith("(")) {
      const nextParen = code.indexOf("(", start);
      if (nextParen < 0) continue;
      start = nextParen + 1;
    }
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") depth -= 1;
      i += 1;
    }
    lists.push(code.slice(start, i - 1));
  }
  return lists;
}

export function checkWriter(src) {
  const lists = findInsertColumnLists(src);
  if (lists.length === 0) return { ok: false, reason: "no INSERT INTO accounting.journal_entries found" };
  const missing = lists.filter((l) => !/is_sample_data/.test(l));
  if (missing.length > 0) {
    return { ok: false, reason: `${missing.length} of ${lists.length} journal_entries INSERT(s) missing is_sample_data` };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const good = `await client.query(\`INSERT INTO accounting.journal_entries (operating_company_id, is_sample_data) VALUES ($1,$2)\`)`;
  const bad = `await client.query(\`INSERT INTO accounting.journal_entries (operating_company_id) VALUES ($1)\`)`;
  const commentTrap = `// INSERT INTO accounting.journal_entries (is_sample_data) fake\nawait client.query(\`INSERT INTO accounting.journal_entries (operating_company_id) VALUES ($1)\`)`;
  const noSpaceForm = `await client.query(\`INSERT INTO accounting.journal_entries\n  (operating_company_id, is_sample_data)\nVALUES ($1,$2)\`)`;

  const g = checkWriter(good);
  if (!g.ok) fail(`selftest: good fixture flagged — ${g.reason}`);
  const b = checkWriter(bad);
  if (b.ok) fail("selftest: bad fixture (is_sample_data stripped) was not caught — invariant is inert");
  const c = checkWriter(commentTrap);
  if (c.ok) fail("selftest: a mention of is_sample_data in a COMMENT satisfied the check — comment-matching trap");
  const n = checkWriter(noSpaceForm);
  if (!n.ok) fail(`selftest: no-space-before-paren form (used by 2 of the 5 real writers) misparsed — ${n.reason}`);

  for (const w of WRITERS) {
    const src = fs.readFileSync(path.join(ROOT, w), "utf8");
    const r = checkWriter(src);
    if (!r.ok) fail(`selftest baseline: real writer ${w} should pass but does not — ${r.reason}`);
  }

  console.log(`[${LABEL}] selftest: PASS — fixtures classify correctly (incl. the no-space INSERT form); all ${WRITERS.length} real writers pass`);
  process.exit(0);
}

const failures = [];
for (const w of WRITERS) {
  const p = path.join(ROOT, w);
  if (!fs.existsSync(p)) {
    failures.push(`${w}: file not found`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  const r = checkWriter(src);
  if (!r.ok) failures.push(`${w}: ${r.reason}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL — ${failures.length} of ${WRITERS.length} JE writer(s) regressed:`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all ${WRITERS.length} remaining journal_entries writers explicitly bind is_sample_data`);
