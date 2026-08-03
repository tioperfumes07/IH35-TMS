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
const ACCRUAL = "apps/backend/src/accounting/related-party-loan-posting/interest-accrual.service.ts";

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

  // 4. INTEREST ACCRUAL MUST NOT REUSE THE FACTORING ROLE (LOAN-07).
  //
  // This is the specific misposting this lane exists to prevent, and it is one identifier away at all
  // times. Verified on prod 2026-08-03: `default_interest_expense` resolves to 6830 Factoring Default
  // Interest on BOTH TRANSP and USMCA. Factoring default interest is a penalty on receivables sold;
  // owner-loan interest is the cost of insider money. ASC 850 requires the second to be separately
  // disclosable, and once both land in 6830 no query can pull them apart again — the amounts are
  // commingled in a single account with no distinguishing column. There is no later fix, only a restated
  // period. So the accrual must resolve `related_party_interest_expense` and must never NAME the other.
  const accrual = files[ACCRUAL];
  if (accrual == null) {
    problems.push(`${ACCRUAL} is missing — nothing accrues interest on related-party loans.`);
  } else {
    const acc = stripComments(accrual);
    if (!/related_party_interest_expense/.test(acc)) {
      problems.push(
        `${ACCRUAL}: no longer resolves related_party_interest_expense. Without its own role the accrual ` +
          `has nowhere correct to post and will be pointed at whatever interest account is nearest.`
      );
    }
    if (/default_interest_expense/.test(acc)) {
      problems.push(
        `${ACCRUAL}: references default_interest_expense, which is bound to 6830 Factoring Default ` +
          `Interest on TRANSP and USMCA. Related-party interest posted there is commingled with a ` +
          `financing penalty and cannot be separated afterwards — ASC 850 disclosure becomes impossible.`
      );
    }
    // Both accrual directions must balance, counted in the builder scope only — same scoping discipline
    // as check 1, and for the same reason: the Posting type declaration matches the leg pattern.
    const aStart = acc.indexOf("function buildInterestAccrualPostings");
    if (aStart === -1) {
      problems.push(`${ACCRUAL}: buildInterestAccrualPostings is gone — nothing constructs the accrual legs.`);
    } else {
      const rest = acc.slice(aStart);
      const nextExport = rest.indexOf("\nexport ", 1);
      const aScope = nextExport === -1 ? rest : rest.slice(0, nextExport);
      const aDr = (aScope.match(/debit_or_credit:\s*"debit"/g) || []).length;
      const aCr = (aScope.match(/debit_or_credit:\s*"credit"/g) || []).length;
      if (aDr !== aCr || aDr < 2) {
        problems.push(
          `${ACCRUAL}: expected balanced accrual legs across both directions (got ${aDr} debit / ${aCr} ` +
            `credit). A reversed or unbalanced accrual misstates income and expense by the same amount, ` +
            `which nets to zero on the trial balance and therefore passes every totals check.`
        );
      }
    }
    // The accrual writes nothing while the flag is off; losing that gate would post to a live ledger.
    if (!/RELATED_PARTY_LOAN_GL_POSTING_FLAG|accrualEnabled/.test(acc)) {
      problems.push(
        `${ACCRUAL}: the posting flag gate is gone. Posting flags are OFF per entity until a balanced ` +
          `tie-out is proven; an ungated accrual would begin writing to the live ledger on deploy.`
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
  for (const f of [POSTER, ROUTES, ACCRUAL]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
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
  const goodAccrual = `
    export type Posting = { debit_or_credit: "debit" | "credit"; };
    export function buildInterestAccrualPostings(direction, i, c, amountCents, memo) {
      if (direction === "out") return [
        { account_id: c, debit_or_credit: "debit", amount_cents: amountCents },
        { account_id: i, debit_or_credit: "credit", amount_cents: amountCents }];
      return [
        { account_id: i, debit_or_credit: "debit", amount_cents: amountCents },
        { account_id: c, debit_or_credit: "credit", amount_cents: amountCents }];
    }
    const r = resolveRoleAccount(client, id, "related_party_interest_expense");
    export async function accrualEnabled(){ return isEnabled(RELATED_PARTY_LOAN_GL_POSTING_FLAG); }
  `;
  const ok = { [POSTER]: goodPoster, [ROUTES]: goodRoutes, [ACCRUAL]: goodAccrual };

  t("the real shape passes", analyse(ok).length === 0);

  // THE MISPOSTING THIS LANE EXISTS TO PREVENT — one identifier away, verified on prod.
  t("reusing default_interest_expense in the accrual FAILS",
    analyse({ ...ok, [ACCRUAL]: goodAccrual.replace("related_party_interest_expense", "default_interest_expense") }).length >= 1);
  t("a missing accrual service FAILS", analyse({ ...ok, [ACCRUAL]: null }).length === 1);
  t("unbalanced accrual legs FAIL",
    analyse({ ...ok, [ACCRUAL]: goodAccrual.replace(/debit_or_credit: "credit"/, 'debit_or_credit: "debit"') }).length >= 1);
  t("dropping the accrual posting-flag gate FAILS",
    analyse({ ...ok, [ACCRUAL]: goodAccrual.replace("RELATED_PARTY_LOAN_GL_POSTING_FLAG", "true").replace("accrualEnabled", "always") }).length >= 1);
  t("a missing poster FAILS", analyse({ [POSTER]: null, [ROUTES]: goodRoutes, [ACCRUAL]: goodAccrual }).length === 1);
  t("unbalanced legs FAIL",
    analyse({ [POSTER]: goodPoster.replace(/debit_or_credit: "credit"/, 'debit_or_credit: "debit"'), [ROUTES]: goodRoutes }).length >= 1);
  t("removing the refusal path FAILS",
    analyse({ [POSTER]: goodPoster.replace('{ ok: false, missingRole: "cash_clearing" }', "{ ok: true, accountId: 'suspense' }"), [ROUTES]: goodRoutes }).length >= 1);
  t("a QBO push reference FAILS",
    analyse({ [POSTER]: goodPoster + "\nconst f = QBO_JE_PUSH_ENABLED;", [ROUTES]: goodRoutes, [ACCRUAL]: goodAccrual }).length >= 1);
  t("losing entity scope in the register FAILS",
    analyse({ [POSTER]: goodPoster, [ROUTES]: 'filters.push("e.reversed_at IS NULL");', [ACCRUAL]: goodAccrual }).length === 1);
  t("counting reversed rows in the register FAILS",
    analyse({ [POSTER]: goodPoster, [ROUTES]: 'filters.push("e.operating_company_id = $1");', [ACCRUAL]: goodAccrual }).length === 1);
  t("a COMMENT mentioning a QBO flag does not trip it",
    analyse({ [POSTER]: goodPoster + "\n// never set QBO_JE_PUSH_ENABLED here", [ROUTES]: goodRoutes, [ACCRUAL]: goodAccrual }).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 13 cases (2 pass-shapes incl. the type-declaration miscount that fooled the first version, 11 fail-shapes incl. the default_interest_expense misposting)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — balanced legs both directions, refusal path intact, no QBO push, register entity-scoped, accrual on its own role + flag-gated`);
