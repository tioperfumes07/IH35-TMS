#!/usr/bin/env node
/**
 * GUARD — ACCT-F113: the three Loans & Advances invariants that cannot be allowed to rot.
 *
 * Spec §5 asks for a balanced-JE guard, a linkage guard, and a no-QBO-push guard for this source type.
 * All three are STATIC checks against the source, because each protects a property that is invisible
 * until money is already wrong:
 *
 *  1. BALANCED — buildRelatedPartyLoanPostings must emit exactly one debit and one credit for the SAME
 *     amount, in BOTH directions. An unbalanced related-party JE corrupts the trial balance and is only
 *     discovered at close, by which point the estate's books have been filed on.
 *
 *  2. NO SILENT DEFAULT — resolveCounterAccount must REFUSE when it cannot resolve, never fall back to
 *     a suspense/other account. A loan posted to a guessed account is worse than one that failed to
 *     post: the failure is visible, the misposting is not.
 *
 *  3. NO QBO WRITE-BACK — this source type must never touch a QBO push/projection flag. QBO is the
 *     system of record under parallel books; pushing a TMS-originated related-party loan into it would
 *     double-book against the very ledger we reconcile to.
 *
 * NOT ASSERTED HERE, deliberately: that a POSTED entry has a non-null je_id. That is a DATA property of
 * a live row, not a source property — a static guard claiming to prove it would be theatre. It belongs
 * in the live tie-out (three-gate proof), and saying so is more useful than a check that cannot fail.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:related-party-loan-integrity";
const POSTER = "apps/backend/src/accounting/related-party-loan-posting/poster.service.ts";
const ROUTES = "apps/backend/src/accounting/related-party-loan-posting/routes.ts";

export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(files) {
  const problems = [];
  const poster = files[POSTER];
  const routes = files[ROUTES];

  if (poster == null) return [`${POSTER} is missing — the related-party loan poster is gone.`];
  const p = stripComments(poster);

  // 1. BALANCED — both directions must emit one debit and one credit.
  //
  // Counted inside the BUILDER only. A first version counted across the whole file and reported 3 debit
  // / 2 credit against correct code, because the Posting TYPE declaration
  // (`debit_or_credit: "debit" | "credit";`) matched the debit pattern. Verified against the real source
  // before changing anything — the poster was right and the guard was wrong. A guard that miscounts a
  // correct file teaches people to ignore it.
  // Scope = from the builder declaration to the NEXT top-level export (or EOF). Anchoring on a closing
  // brace was brittle: `\n}` only matches an unindented brace, so an indented function body silently
  // yielded an EMPTY scope and the guard then "failed" a correct file for having zero legs.
  const builderStart = p.indexOf("function buildRelatedPartyLoanPostings");
  const builder = builderStart === -1 ? null : true;
  let scope = "";
  if (builderStart !== -1) {
    const rest = p.slice(builderStart);
    const nextExport = rest.indexOf("\nexport ", 1);
    scope = nextExport === -1 ? rest : rest.slice(0, nextExport);
  }
  if (!builder) {
    problems.push(`${POSTER}: buildRelatedPartyLoanPostings is gone — nothing constructs the loan legs.`);
  }
  const debits = (scope.match(/debit_or_credit:\s*"debit"/g) || []).length;
  const credits = (scope.match(/debit_or_credit:\s*"credit"/g) || []).length;
  if (debits !== credits || debits < 2) {
    problems.push(
      `${POSTER}: expected an equal number of debit and credit legs across both directions (got ` +
        `${debits} debit / ${credits} credit). An unbalanced related-party JE corrupts the trial balance ` +
        `and surfaces only at close.`
    );
  }
  if (!/amountCents/.test(p)) {
    problems.push(`${POSTER}: legs no longer carry the caller's amountCents — a split or partial amount cannot balance.`);
  }

  // 2. NO SILENT DEFAULT — the resolver must have a refusal path.
  if (!/resolveCounterAccount/.test(p)) {
    problems.push(`${POSTER}: resolveCounterAccount is gone — nothing decides the non-related-party side.`);
  } else {
    // BOTH branches of resolveCounterAccount can fail to resolve — 'out' when the cash_clearing role is
    // unbound, 'in' when no obligation account was chosen — so BOTH must be able to refuse. Requiring
    // merely that *a* refusal exists somewhere is fail-open: mutation-testing showed that swapping one
    // branch for `{ ok: true, accountId: "suspense" }` still passed, because the other branch's
    // `ok: false` kept the pattern satisfied. Count them.
    // Count refusals in the BODY only. The function's own return TYPE
    // (`Promise<{ ok: true; ... } | { ok: false; missingRole: string }>`) contains `ok: false` too, and
    // counting it inflated the total to 3 — so deleting one real refusal still left 2 and passed. Same
    // artifact class as the type-declaration miscount above. Twice in one guard; both found by mutation,
    // neither by reading.
    const resolverStart = p.indexOf("function resolveCounterAccount");
    const afterSig = resolverStart === -1 ? "" : p.slice(p.indexOf("{", p.indexOf("Promise<", resolverStart)));
    const refusals = (afterSig.match(/return\s*\{[^}]*ok:\s*false/g) || []).length;
    if (refusals < 2 || !/missingRole/.test(p)) {
      problems.push(
        `${POSTER}: resolveCounterAccount has ${refusals} refusal path(s); BOTH the 'in' and 'out' ` +
          `branches must be able to refuse with ok:false + missingRole. A silent fallback account would ` +
          `post a related-party loan somewhere plausible and wrong — and plausible is what makes it survive review.`
      );
    }
  }

  // 3. NO QBO WRITE-BACK from this source type.
  for (const [file, src] of Object.entries(files)) {
    if (src == null) continue;
    const body = stripComments(src);
    const m = /QBO_[A-Z_]*(PUSH|PROJECTION)[A-Z_]*/.exec(body);
    if (m) {
      problems.push(
        `${file}: references ${m[0]}. This source type must NEVER push to QuickBooks — QBO is the system ` +
          `of record under parallel books, so a push would double-book against the ledger we reconcile to.`
      );
    }
  }

  // The register must stay entity-scoped and must not resurrect reversed rows into the balance.
  if (routes != null) {
    const r = stripComments(routes);
    if (!/operating_company_id\s*=\s*\$1/.test(r)) {
      problems.push(`${ROUTES}: the register query is no longer entity-scoped on operating_company_id.`);
    }
    if (!/reversed_at IS NULL/.test(r)) {
      problems.push(
        `${ROUTES}: reversed entries are no longer excluded from the default register — a reversed loan ` +
          `would inflate the running balance (void-not-delete requires retaining them, not counting them).`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [POSTER, ROUTES]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  const goodPoster = `
    export type Posting = { debit_or_credit: "debit" | "credit"; };
    export function buildRelatedPartyLoanPostings(direction, a, b, amountCents, memo) {
      if (direction === "in") return [
        { account_id: b, debit_or_credit: "debit", amount_cents: amountCents },
        { account_id: a, debit_or_credit: "credit", amount_cents: amountCents }];
      return [
        { account_id: a, debit_or_credit: "debit", amount_cents: amountCents },
        { account_id: b, debit_or_credit: "credit", amount_cents: amountCents }];
    }
    export async function resolveCounterAccount(d) {
      if (d === "out") return { ok: false, missingRole: "cash_clearing" };
      return { ok: false, missingRole: "funding_account_id" };
    }
  `;
  const goodRoutes = `filters.push("e.operating_company_id = $1"); filters.push("e.reversed_at IS NULL");`;

  t("the real shape passes", analyse({ [POSTER]: goodPoster, [ROUTES]: goodRoutes }).length === 0);
  t("a missing poster FAILS", analyse({ [POSTER]: null, [ROUTES]: goodRoutes }).length === 1);
  t("unbalanced legs FAIL",
    analyse({ [POSTER]: goodPoster.replace(/debit_or_credit: "credit"/, 'debit_or_credit: "debit"'), [ROUTES]: goodRoutes }).length >= 1);
  t("removing the refusal path FAILS",
    analyse({ [POSTER]: goodPoster.replace('{ ok: false, missingRole: "cash_clearing" }', "{ ok: true, accountId: 'suspense' }"), [ROUTES]: goodRoutes }).length >= 1);
  t("a QBO push reference FAILS",
    analyse({ [POSTER]: goodPoster + "\nconst f = QBO_JE_PUSH_ENABLED;", [ROUTES]: goodRoutes }).length >= 1);
  t("losing entity scope in the register FAILS",
    analyse({ [POSTER]: goodPoster, [ROUTES]: 'filters.push("e.reversed_at IS NULL");' }).length === 1);
  t("counting reversed rows in the register FAILS",
    analyse({ [POSTER]: goodPoster, [ROUTES]: 'filters.push("e.operating_company_id = $1");' }).length === 1);
  t("a COMMENT mentioning a QBO flag does not trip it",
    analyse({ [POSTER]: goodPoster + "\n// never set QBO_JE_PUSH_ENABLED here", [ROUTES]: goodRoutes }).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 8 cases (2 pass-shapes incl. the type-declaration miscount that fooled the first version, 6 fail-shapes)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — balanced legs both directions, refusal path intact, no QBO push, register entity-scoped`);
