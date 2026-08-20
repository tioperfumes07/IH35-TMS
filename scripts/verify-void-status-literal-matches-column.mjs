#!/usr/bin/env node
/**
 * CLS-VOID-LITERAL-DEAD — a query must not filter on a status literal that CANNOT OCCUR in that
 * column. Such a predicate is not a weak filter; it is a filter that never fires, and it reads to
 * every future reader as if the case were handled.
 *
 * WHAT WAS BROKEN (ACCT-F171, live-proven on Neon prod br-fancy-credit-akjnd07a 2026-08-07):
 * `accounting/ar-aging.service.ts` excluded `status NOT IN ('paid', 'voided', 'draft')`.
 * `accounting.invoices.status` spells a void as **'void'**, and **'voided' is not merely absent —
 * it is FORBIDDEN by `invoices_status_check`**, whose domain is
 * `draft, proforma, sent, partial, paid, void, factored`. The database would reject that value, so
 * the status half of that exclusion could never fire and the whole void exclusion rested on
 * `voided_at IS NULL` alone. One invoice breaks that pairing (status='void' with voided_at NULL —
 * the live half of LV-VOID-INVARIANT-BOTH-WAYS), and A/R aging counted it: USMCA reported
 * **$4,325.50** outstanding where **$1,875.50** was real. A voided **$2,450.00** invoice was 56.6%
 * of the entity's reported receivables and looked like an ordinary number on the page.
 *
 * WHY THIS GUARD IS ALLOWED WHERE A BROAD ONE IS NOT. The board's standing ruling
 * (CLS-VOID-PREDICATE-DRIFT) says: do NOT build a broad "money totals exclude voided rows" guard —
 * it was attempted three times and produced mostly false positives, because ten different
 * predicates all correctly mean "not voided". That ruling stands and this guard does not violate
 * it, because it asks a different and much narrower question. It never asks *whether* a query
 * excludes voided rows. It asks only: **of the status literals this query does name, can each one
 * actually occur in that column?** The answer comes from the column's CHECK constraint on prod, so
 * it is a single objective fact per (table, column) — not a matter of judgement, and not a sample
 * that a quiet period could poison.
 *
 * THE NEGATIVE RESULTS ARE PART OF THE GUARD, deliberately recorded so nobody "fixes" working code:
 *   - `accounting.journal_entries.status` is **'posted' on all 1,806 rows**, and by DESIGN rather
 *     than by accident, which is what makes it safe to leave alone. The ~13 sites filtering
 *     `je.status <> 'voided'` are intentional belt-and-braces: the void path posts an equal-and-
 *     opposite reversing JE and NEVER flips the original's status (journal-entries.service.ts:465).
 *     Those sites are CORRECT. Flipping a JE to 'voided' to "make the filter work" would break the
 *     reversal model, so `journal_entries` is deliberately NOT enrolled below.
 *   - `accounting.bills.status` never takes 'void' or 'voided' either — bills void via `revoked_at`,
 *     and `ap-aging.service.ts` already filters `b.revoked_at IS NULL`, so **A/P aging is CORRECT**
 *     despite naming a dead literal. Enrolling `bills.status` would redden correct code for a
 *     harmless leftover, which is exactly the false-positive class the board ruled against.
 *
 * So enrolment is opt-in per (table, column) and each entry carries the prod evidence that justifies
 * it. This starts at one column — the one where the dead literal cost real money — and grows only
 * when another column is measured, never by pattern-matching.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-void-status-literal-matches-column";
const SRC = "apps/backend/src";

/**
 * Enrolled columns. `domain` is the column's CHECK-constraint domain — the set of values the column
 * can EVER hold — not a sample of what it holds today.
 *
 * THAT DISTINCTION IS THE GUARD. The first version of this file used observed row values and
 * immediately flagged three correct files for naming `'factored'`, a perfectly valid status that
 * simply has no TMS-native rows yet. Sampling turns "we have not done this yet" into "this is a
 * defect" — the expected-state-recorded-as-failure trap — and a guard that reddens on correct code
 * is the exact false-positive class the board's CLS-VOID-PREDICATE-DRIFT ruling forbids. The
 * constraint has no such ambiguity: a literal outside it can never match, in any future, for any
 * entity, because the database would refuse to write it.
 *
 * `tolerated` is for a literal outside the domain that is harmless to keep rather than churn out.
 */
const ENROLLED = [
  {
    table: "accounting.invoices",
    column: "status",
    alias: /\b(i|inv|invoices?)\./,
    /**
     * Prod br-fancy-credit-akjnd07a 2026-08-07, constraint `invoices_status_check`:
     *   CHECK (status = ANY (ARRAY['draft','proforma','sent','partial','paid','void','factored']))
     * Note 'factored' is IN the domain with zero rows today — valid, not dead. And 'voided' is NOT
     * in the domain at all: the database would REJECT that value, so a query excluding it excludes
     * something that cannot exist.
     */
    domain: ["draft", "proforma", "sent", "partial", "paid", "void", "factored"],
    /**
     * 'voided' is impossible by constraint, so naming it is a no-op rather than a risk. It is
     * tolerated instead of banned because ripping it out of every call site is churn with no
     * behavioural change — but it must NEVER be the ONLY void spelling a predicate names, which is
     * the defect this guard exists for and is enforced below.
     */
    tolerated: ["voided"],
    /** A query excluding voids MUST name this, or it is excluding nothing. */
    voidLiteral: "void",
  },
];

/** Strip comments and string bodies we do not want scanned — but keep SQL template contents. */
function stripLineComments(src) {
  return src
    .split("\n")
    .map((l) => l.replace(/^\s*(\/\/|\*|\/\*).*$/, ""))
    .join("\n");
}

/**
 * Find `<alias>.status NOT IN ( … )` / `IN ( … )` predicates and return their literal lists.
 * Deliberately narrow: only the IN-list form, which is the shape that enumerates spellings and
 * therefore the shape that can silently omit one. `<>`/`=` single-value comparisons are a different
 * question (they are usually correct belt-and-braces) and are not scanned.
 */
export function findStatusInPredicates(src, entry) {
  const hits = [];
  // The alias is spliced in as a NON-CAPTURING group. An alias written with capturing groups would
  // shift every index below, which is precisely how the first run of this guard read the wrong
  // capture and passed on its own defect fixture.
  const aliasSource = entry.alias.source.replace(/\((?!\?)/g, "(?:");
  const re = new RegExp(`(?:${aliasSource})\\s*${entry.column}\\s+(NOT\\s+IN|IN)\\s*\\(([^)]*)\\)`, "gi");
  let m;
  while ((m = re.exec(src))) {
    const literals = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    if (literals.length === 0) continue;
    hits.push({ negated: /NOT/i.test(m[1]), literals, text: m[0].replace(/\s+/g, " ").trim() });
  }
  return hits;
}

export function auditSources(files, enrolled = ENROLLED) {
  const problems = [];
  let scanned = 0;
  for (const { rel, src } of files) {
    const code = stripLineComments(src);
    for (const entry of enrolled) {
      // Only consider files that actually query this table — the alias alone is far too loose
      // (`i.status` appears in plenty of unrelated SQL).
      if (!code.includes(entry.table)) continue;
      for (const hit of findStatusInPredicates(code, entry)) {
        scanned++;
        const known = new Set([...entry.domain, ...entry.tolerated]);
        const dead = hit.literals.filter((l) => !known.has(l));
        if (dead.length > 0) {
          problems.push(
            `${rel}: filters ${entry.table}.${entry.column} on ${dead.map((d) => `'${d}'`).join(", ")}, ` +
              `which the column's CHECK constraint FORBIDS (domain: ${entry.domain.join(", ")}). ` +
              `A literal that never matches is a predicate that never fires while reading as if the ` +
              `case were handled. Predicate: ${hit.text}`
          );
        }
        // The ar-aging defect itself: a NOT IN exclusion that names ONLY the never-occurring
        // spelling and omits the real one, so it excludes nothing at all.
        if (
          hit.negated &&
          hit.literals.some((l) => entry.tolerated.includes(l)) &&
          !hit.literals.includes(entry.voidLiteral)
        ) {
          problems.push(
            `${rel}: excludes ${entry.table}.${entry.column} values ${hit.literals.map((l) => `'${l}'`).join(", ")} ` +
              `but NOT '${entry.voidLiteral}' — the only spelling a void actually takes in this column. ` +
              `This exclusion removes nothing; voided rows stay in the result. That is ACCT-F171, ` +
              `which counted a voided $2,450.00 invoice as 56.6% of USMCA's reported A/R. ` +
              `Predicate: ${hit.text}`
          );
        }
      }
    }
  }
  return { problems, scanned };
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (rel.endsWith(".ts") && !rel.endsWith(".d.ts") && !rel.includes(".test.")) out.push(rel);
}

function auditTree() {
  const rels = [];
  walk(SRC, rels);
  const files = rels.map((rel) => ({ rel, src: readFileSync(join(ROOT, rel), "utf8") }));
  const { problems, scanned } = auditSources(files);
  if (scanned === 0) {
    return [
      `${LABEL}: found ZERO enrolled status IN-predicates — the matcher or the table names are stale. ` +
        `Refusing to pass vacuously.`,
    ];
  }
  return problems;
}

/** Mutation proof: each case plants the real defect and asserts this guard goes RED. */
function selftest() {
  const failures = [];
  const q = (pred) => ({
    rel: "apps/backend/src/accounting/ar-aging.service.ts",
    src: `const r = await c.query(\`SELECT i.amount_open_cents FROM accounting.invoices i WHERE ${pred}\`);`,
  });

  // case1 — THE DEFECT verbatim: excludes 'voided', omits 'void'.
  if (auditSources([q("i.status NOT IN ('paid', 'voided', 'draft')")]).problems.length === 0)
    failures.push("case1 FAIL — the ar-aging predicate that excludes NO void was not caught");

  // case2 — the FIX: 'void' present, 'voided' kept.
  if (auditSources([q("i.status NOT IN ('paid', 'void', 'voided', 'draft')")]).problems.length !== 0)
    failures.push("case2 FAIL — the corrected predicate was flagged");

  // case3 — 'void' alone is also correct; keeping 'voided' is optional, not required.
  if (auditSources([q("i.status NOT IN ('paid', 'void', 'draft')")]).problems.length !== 0)
    failures.push("case3 FAIL — excluding only the real literal was flagged");

  // case4 — a literal that is neither occurring nor tolerated is dead and must be caught. This is
  // the general form; case1 is the specific one that cost money.
  if (auditSources([q("i.status NOT IN ('paid', 'cancelled', 'void')")]).problems.length === 0)
    failures.push("case4 FAIL — a never-occurring literal ('cancelled') was not caught");

  // case5 — a POSITIVE IN-list of real values is fine (it is a selection, not an exclusion).
  if (auditSources([q("i.status IN ('sent', 'partial')")]).problems.length !== 0)
    failures.push("case5 FAIL — a positive IN-list of occurring values was flagged");

  // case6 — a file that never mentions the table is out of scope even if the alias matches. Without
  // this the guard reddens on unrelated SQL that happens to use `i.status`.
  const otherTable = {
    rel: "apps/backend/src/mdata/x.service.ts",
    src: `const r = await c.query(\`SELECT 1 FROM mdata.items i WHERE i.status NOT IN ('voided')\`);`,
  };
  if (auditSources([otherTable]).problems.length !== 0)
    failures.push("case6 FAIL — a different table's status predicate was flagged");

  // case7 — journal_entries must stay OUT of scope. Its ~13 `<> 'voided'` sites are correct by
  // design (the void path never flips status; it posts a reversing entry), and enrolling them would
  // redden working code — the false-positive class the board explicitly ruled against.
  const je = {
    rel: "apps/backend/src/accounting/trial-balance.service.ts",
    src: `const r = await c.query(\`SELECT 1 FROM accounting.journal_entries je WHERE je.status <> 'voided'\`);`,
  };
  if (auditSources([je]).problems.length !== 0)
    failures.push("case7 FAIL — a correct journal_entries void filter was flagged");

  // case8 — bills likewise: they void via revoked_at, and ap-aging already filters that. A dead
  // 'voided' literal there is harmless leftover, not a defect.
  const bills = {
    rel: "apps/backend/src/accounting/ap-aging.service.ts",
    src: `const r = await c.query(\`SELECT 1 FROM accounting.bills b WHERE b.revoked_at IS NULL AND b.status NOT IN ('voided', 'draft')\`);`,
  };
  if (auditSources([bills]).problems.length !== 0)
    failures.push("case8 FAIL — a correct bills predicate was flagged (bills void via revoked_at)");

  // case9 — MUTATION AGAINST THE REAL FILE. Restore the pre-fix predicate in the actual ar-aging
  // service on disk and demand RED. Every case above is a fixture this author wrote; only the real
  // source proves the shipped fix is what holds this guard green.
  const rel = "apps/backend/src/accounting/ar-aging.service.ts";
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    failures.push(`case9 FAIL — ${rel} is missing; the live mutation proof cannot run`);
  } else {
    const real = readFileSync(abs, "utf8");
    // ACCT-F5658 — the corrected predicate no longer contains 'paid' (the as-of reconstruction
    // decides paid-ness now), so the mutation needle tracks the CURRENT tuple: strip 'void' from it
    // to reproduce the exact ACCT-F171 shape (an exclusion naming only the unreachable spelling).
    const mutated = real.replace("'void', 'voided', 'draft'", "'voided', 'draft'");
    if (mutated === real) {
      failures.push(`case9 FAIL — ${rel} no longer carries the corrected predicate; ACCT-F171 is back`);
    } else if (auditSources([{ rel, src: mutated }]).problems.length === 0) {
      failures.push(`case9 FAIL — restoring the pre-fix predicate in the REAL ${rel} left this guard GREEN`);
    }
  }

  return failures;
}

const selfFailures = selftest();
if (selfFailures.length) {
  console.error(`${LABEL} SELFTEST FAILED:\n  ${selfFailures.join("\n  ")}`);
  process.exit(1);
}

const problems = auditTree();
if (problems.length) {
  console.error(`${LABEL} FAIL (${problems.length}):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every enrolled status IN-predicate names literals that can actually occur`);
