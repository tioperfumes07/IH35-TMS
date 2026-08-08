#!/usr/bin/env node
/**
 * GUARD: a reversal journal entry must be linked to its original by FK, not by its memo text.
 * LV-INVOICE-VOID-REVERSAL-HAS-NO-JE-LINKAGE / ACCT-F256.
 *
 * `SELECT count(*) FROM accounting.journal_entries WHERE voided_at IS NOT NULL` is **0** on prod. No
 * journal entry is ever voided in place, because reversal-by-new-JE is the only mechanism WORM permits.
 * That single fact is why this matters: `reverses_je_id` / `reversed_by_je_id` is THE ONLY
 * machine-readable audit link between a JE and its reversal. A NULL does not degrade the link — it
 * removes it, and the reversal becomes invisible to every structural query.
 *
 * MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-08: 26 JEs carry a `Reversal of …` memo, only 24
 * carry the FK. Both memo-only rows are named, and one — `8fd32bec` (USMCA bill-payment void) — was
 * created THAT DAY. A live path, not historical residue.
 *
 * THE LINE LEVEL WAS NEVER THE PROBLEM. The engine already sets `reversal_of_line_id` and
 * `reversed_by_line_id` on every posting. It was the JOURNAL-ENTRY level that was left to a memo, and a
 * memo is not a link: my own ACCT-F251 sweep had to fall back to string-matching `Reversal of <uuid>`
 * to find unreversed voided bills precisely because this FK could not be trusted. Any guard built on
 * memo text breaks the day someone rewords a memo.
 *
 * BOTH DIRECTIONS ARE REQUIRED. Forward-only (`reverses_je_id` on the new JE) answers "what did this
 * reverse?" but not "was this reversed?" — and the second question is the one every integrity sweep
 * asks. Setting only one is the shape that produced the 2-of-26 gap.
 *
 * Run:  node scripts/verify-reversal-je-linkage.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const VOID_SVC = "apps/backend/src/accounting/void.service.ts";
const LABEL = "verify-reversal-je-linkage";

export function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Does the engine write BOTH JE-level reversal FKs? */
export function reversalLinkage(src) {
  const clean = stripComments(src);
  const writesForward = /UPDATE\s+accounting\.journal_entries[\s\S]{0,220}?SET\s+reverses_je_id\s*=/i.test(clean);
  const writesBack = /UPDATE\s+accounting\.journal_entries[\s\S]{0,220}?SET\s+reversed_by_je_id\s*=/i.test(clean);
  // A reversal JE is created here at all — if this ever stops being true the guard should say so
  // rather than silently pass on a file that no longer reverses anything.
  const createsReversal = /`Reversal of \$\{/.test(clean) || /Reversal of \$\{original/.test(clean);
  return { writesForward, writesBack, createsReversal };
}

/**
 * ACCT-F268 — postVoidReversal is the SHARED primitive with six callers; only one wrote the FK
 * afterwards, so five void paths produced reversals linked to their original by memo text alone.
 * The FK belongs in the primitive, not in each caller (the ACCT-F265 lesson).
 */
export function voidPrimitiveLinks(src) {
  const clean = stripComments(src);
  return {
    found: /export\s+async\s+function\s+postVoidReversal\b/.test(clean),
    forward: /UPDATE\s+accounting\.journal_entries[\s\S]{0,200}?SET\s+reverses_je_id\s*=/i.test(clean),
    back: /UPDATE\s+accounting\.journal_entries[\s\S]{0,200}?SET\s+reversed_by_je_id\s*=/i.test(clean),
  };
}

export function collectProblems(src, voidSrc = "") {
  const problems = [];
  const r = reversalLinkage(src);
  if (!r.createsReversal) {
    problems.push(
      `${ENGINE}: no reversal journal entry is created here any more. If reversal moved, move this ` +
        `guard with it — an unparsed reversal path must not read as a pass (ACCT-F256).`
    );
    return problems;
  }
  if (!r.writesForward) {
    problems.push(
      `${ENGINE}: the reversal JE is created but reverses_je_id is never set, so the only link back to ` +
        `the original is the memo string. No JE is ever voided in place (voided_at count = 0), so this ` +
        `FK is the ONLY machine-readable reversal link — a NULL makes the reversal invisible to every ` +
        `structural query (ACCT-F256).`
    );
  }
  if (!r.writesBack) {
    problems.push(
      `${ENGINE}: reversed_by_je_id is never set on the ORIGINAL entry. Forward-only linkage answers ` +
        `"what did this reverse?" but not "was this reversed?" — and that second question is the one ` +
        `every integrity sweep asks (ACCT-F256).`
    );
  }
  if (voidSrc) {
    const v = voidPrimitiveLinks(voidSrc);
    if (!v.found) {
      problems.push(`${VOID_SVC}: postVoidReversal not found — if the shared void primitive moved, move this guard with it (ACCT-F268).`);
    } else if (!v.forward || !v.back) {
      problems.push(
        `${VOID_SVC}: postVoidReversal does not write BOTH reversal FKs. It has six callers and only ` +
          `one wrote them afterwards, so five void paths link a reversal to its original by MEMO TEXT ` +
          `only — JE 8fd32bec is exactly that. No JE is ever voided in place, so this FK is the only ` +
          `machine-readable reversal link (ACCT-F268).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const CREATE = "const m = `Reversal of ${original.journal_entry_id}`;\n";
  const FWD = "await c.query(`UPDATE accounting.journal_entries SET reverses_je_id = $2::uuid WHERE id=$1`);\n";
  const BACK = "await c.query(`UPDATE accounting.journal_entries SET reversed_by_je_id = $2::uuid WHERE id=$1`);\n";

  if (collectProblems(CREATE + FWD + BACK).length !== 0) failures.push("the fully-linked engine was flagged");
  if (!collectProblems(CREATE + BACK).some((p) => /reverses_je_id is never set/.test(p))) {
    failures.push("a missing FORWARD link was NOT caught");
  }
  if (!collectProblems(CREATE + FWD).some((p) => /reversed_by_je_id is never set/.test(p))) {
    failures.push("a missing BACK link was NOT caught — the 2-of-26 shape");
  }
  if (collectProblems(CREATE).length !== 2) failures.push("both missing links were not both reported");
  // A comment must not satisfy either direction.
  const commentOnly = CREATE + "// UPDATE accounting.journal_entries SET reverses_je_id = x\n// SET reversed_by_je_id = y\n";
  if (collectProblems(commentOnly).length !== 2) failures.push("COMMENTS satisfied the checks — false green");
  // Updating a DIFFERENT table must not count.
  const wrongTable = CREATE + "await c.query(`UPDATE accounting.bills SET reverses_je_id = $2`);\n";
  if (!collectProblems(wrongTable).some((p) => /reverses_je_id is never set/.test(p))) {
    failures.push("an UPDATE on the wrong table satisfied the forward check");
  }

  const GOOD_V = "export async function postVoidReversal(){ await c.query(`UPDATE accounting.journal_entries SET reverses_je_id = $2::uuid`); await c.query(`UPDATE accounting.journal_entries SET reversed_by_je_id = $2::uuid`); }";
  if (collectProblems(CREATE + FWD + BACK, GOOD_V).length !== 0) failures.push("the linked void primitive was flagged");
  if (!collectProblems(CREATE + FWD + BACK, "export async function postVoidReversal(){ return 1; }").some((p) => /does not write BOTH reversal FKs/.test(p))) {
    failures.push("an unlinked void primitive was NOT caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (linked engine passes, missing forward caught, missing back caught, ` +
      `both reported together, comments cannot fake, wrong table rejected, void primitive covered)`
  );
  process.exit(0);
}

const p = path.join(root, ENGINE);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${ENGINE} is missing.`);
  process.exit(1);
}
const vp = path.join(root, VOID_SVC);
const problems = collectProblems(
  fs.readFileSync(p, "utf8"),
  fs.existsSync(vp) ? fs.readFileSync(vp, "utf8") : ""
);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} gap(s) in reversal linkage:`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — reversal JEs are linked to their originals by FK in BOTH directions.`);
