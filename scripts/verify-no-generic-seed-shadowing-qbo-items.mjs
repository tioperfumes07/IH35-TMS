#!/usr/bin/env node
/**
 * ACCT-F77 — the QBO items sync must never rename its own twin into a unique-constraint collision,
 * and the adopt path must stand down when a twin already claims the QBO id.
 *
 * WHY (proven on the prod branch, 2026-08-01, both failure modes observed live):
 * qbo_sync.step.items_pull and .items_reconcile have last_successful_run_at = NULL — they have NEVER
 * succeeded. _system.background_jobs at 21:00:03Z 2026-08-01 shows the two DISTINCT errors this file
 * guards:
 *   items_pull       -> duplicate key value violates unique constraint "uq_items_company_qbo_item_id"
 *   items_reconcile  -> duplicate key value violates unique constraint "uq_items_company_item_name"
 *
 * Index shapes verified on prod (pg_indexes), because the whole fix turns on which one is partial:
 *   uq_items_company_item_name    UNIQUE (operating_company_id, item_name)                    -- NOT partial
 *   uq_items_company_qbo_item_id  UNIQUE (operating_company_id, qbo_item_id) WHERE NOT NULL   -- partial
 *
 * TWO INVARIANTS, one per live failure:
 *
 * 1. THE ADOPT MUST CHECK FOR A TWIN (uq_items_company_qbo_item_id).
 *    The ACCT-F68 adopt matches an unclaimed row by NAME and stamps the QBO id onto it. With no check
 *    that another row already carries that id, it violates uq_items_company_qbo_item_id and aborts the
 *    pull just as surely as the bug it was meant to fix. Adoption must stand down when a twin exists;
 *    the twin is already the correct carrier.
 *
 * 2. THE UPSERT MUST NOT ASSIGN item_name ON CONFLICT (uq_items_company_item_name).
 *    The upsert matches its twin on the PARTIAL arbiter (operating_company_id, qbo_item_id) and a
 *    DO UPDATE that renames '<name> [QBO n]' -> '<name>' collides with a same-named native row under
 *    the NON-partial name index, aborting the step. QBO owns the item's identity and economics, not
 *    its local display name once that name is taken.
 *
 * NOTE ON SCOPE: no migration ships with this fix. An earlier draft retired the colliding rows in SQL;
 * it was dropped in favour of the code fix, which makes the sync green with ZERO data mutation and
 * presumes no naming convention the owner has not ruled on. This guard therefore asserts CODE shape
 * only — there is no data-retirement step for it to check.
 *
 * VERIFY-THE-VERIFIER: the checks below assert the REAL linkage column and the REAL bound parameter,
 * never the mere presence of a keyword. A previous revision passed as long as the string "NOT EXISTS"
 * appeared anywhere in the adopt — a subquery on the wrong column would have satisfied it while being
 * permanently false, i.e. inert. That class of fail-open guard is itself a defect, so every check here
 * is mutation-tested in BOTH directions against the REAL source file (see selftest()), and every
 * mutation asserts that it actually applied — a fixture that silently stops matching the source can
 * never again masquerade as a passing test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PULLER = "apps/backend/src/qbo-sync/items-puller.ts";
const LABEL = "verify-no-generic-seed-shadowing-qbo-items";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, "");
}

/** Return the balanced-paren substring starting at the "(" at or after `from`, exclusive of the outer parens. */
function balancedParen(text, from) {
  const open = text.indexOf("(", from);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

export function auditAdopt(src) {
  const code = stripComments(src);
  const problems = [];
  const upd = /UPDATE\s+catalogs\.items[\s\S]*?RETURNING/i.exec(code);
  if (!upd) {
    problems.push(
      `${PULLER}: no adopt step — a QBO item matching an unclaimed local row falls through to an INSERT that collides on item_name.`
    );
    return problems;
  }
  const adopt = upd[0];

  // Read the QBO-id parameter off the SET clause rather than hardcoding $3, so the guard follows the
  // code instead of assuming a parameter order that a future edit may change.
  const setParam = /\bqbo_item_id\s*=\s*(\$\d+)/i.exec(adopt);
  if (!setParam) {
    problems.push(`${PULLER}: the adopt UPDATE never assigns qbo_item_id — it is not an adopt at all.`);
    return problems;
  }
  const idParam = setParam[1];
  const idParamRe = new RegExp(`\\${idParam}(?!\\d)`);

  if (!/qbo_item_id\s+IS\s+NULL/i.test(adopt)) {
    problems.push(
      `${PULLER}: the adopt UPDATE does not require qbo_item_id IS NULL — it could rebind a row already owned by a different QBO item.`
    );
  }

  const notExistsAt = adopt.search(/NOT\s+EXISTS\s*\(/i);
  if (notExistsAt === -1) {
    problems.push(
      `${PULLER}: the adopt UPDATE does not check whether ANOTHER row already claims this qbo_item_id. ` +
        `Stamping a twin-held id violates uq_items_company_qbo_item_id and aborts the pull — the same ` +
        `class of failure the adopt was written to fix.`
    );
    return problems;
  }

  const sub = balancedParen(adopt, notExistsAt);
  if (sub === null) {
    problems.push(`${PULLER}: the adopt UPDATE's NOT EXISTS has unbalanced parentheses — cannot verify the twin check.`);
    return problems;
  }

  // The invariant is the LINKAGE COLUMN, not the keyword. A NOT EXISTS on any other column is
  // permanently false, so the guard would be always-true and protect nothing.
  if (!/FROM\s+catalogs\.items\b/i.test(sub)) {
    problems.push(
      `${PULLER}: the adopt's NOT EXISTS does not read catalogs.items, so it cannot detect a twin. ` +
        `A subquery over any other relation is inert here.`
    );
  }

  const comparesQboId =
    new RegExp(`qbo_item_id\\s*=\\s*\\${idParam}(?!\\d)`, "i").test(sub) ||
    new RegExp(`\\${idParam}(?!\\d)\\s*=\\s*(?:[a-z_]+\\.)?qbo_item_id`, "i").test(sub);
  if (!comparesQboId) {
    problems.push(
      `${PULLER}: the adopt's NOT EXISTS does not compare qbo_item_id to ${idParam} (the parameter the ` +
        `UPDATE stamps into qbo_item_id). A twin check against any other column — or against a different ` +
        `bound parameter — never matches a row, so NOT EXISTS is always true and the check is INERT. ` +
        `uq_items_company_qbo_item_id is the constraint being defended; qbo_item_id is the only column ` +
        `that can defend it.`
    );
  }

  if (!/operating_company_id\s*=/i.test(sub) || !idParamRe.test(sub)) {
    if (!/operating_company_id\s*=/i.test(sub)) {
      problems.push(
        `${PULLER}: the adopt's NOT EXISTS is not scoped by operating_company_id. ` +
          `uq_items_company_qbo_item_id is (operating_company_id, qbo_item_id): an unscoped probe both ` +
          `reads across entities and mis-reports a twin that belongs to another operating company.`
      );
    }
  }

  return problems;
}

export function auditUpsertKeepsName(src) {
  const code = stripComments(src);
  const problems = [];
  const ins = /INSERT INTO catalogs\.items[\s\S]*?DO UPDATE SET([\s\S]*?)`/i.exec(code);
  if (!ins) {
    problems.push(`${PULLER}: no catalogs.items upsert found — cannot verify the item_name invariant.`);
    return problems;
  }
  // The invariant is that item_name is NOT ASSIGNED on conflict — in ANY form. Matching only
  // "EXCLUDED.item_name" would wave through `item_name = COALESCE(EXCLUDED.item_name, ...)`, which
  // renames the twin exactly as destructively whenever QBO supplies a name.
  const assigns = /(^|,)\s*item_name\s*=/m.exec(ins[1]);
  if (assigns) {
    problems.push(
      `${PULLER}: the upsert's DO UPDATE assigns item_name. That renames the '<name> [QBO nn]' twin to ` +
        `QBO's bare short name and collides with a same-named native row under uq_items_company_item_name ` +
        `— UNIQUE(operating_company_id, item_name), NOT partial. This is the single line that made ` +
        `items_pull and items_reconcile abort on every run. QBO owns the item's identity and economics, ` +
        `not its local display name once that name is taken.`
    );
  }
  return problems;
}

/**
 * ACCT-F83 — the puller's upsert SQL moved into items-write-sql.ts (one reviewed home for every
 * QBO-sourced catalogs.items write, shared with the reconciler). This guard's item_name invariant is
 * about the SQL, not about which file holds it, so it now reads BOTH and audits the pair.
 *
 * It failed CLOSED when the SQL moved ("no catalogs.items upsert found") rather than passing by
 * absence, which is the correct behaviour and the reason this is a re-anchor and not a repair of a
 * fail-open hole. Both files are required to exist: if either read throws, the guard errors instead of
 * quietly auditing half the statement.
 */
const SQL_MODULE = "apps/backend/src/qbo-sync/items-write-sql.ts";

function realSource() {
  return `${readFileSync(join(ROOT, PULLER), "utf8")}\n${readFileSync(join(ROOT, SQL_MODULE), "utf8")}`;
}

function auditTree(src = realSource()) {
  return [...auditAdopt(src), ...auditUpsertKeepsName(src)];
}

/**
 * Apply a mutation to real source and PROVE it applied. A mutation that silently no-ops (because the
 * source moved on) would leave the negative case untested while still reporting PASS — the exact
 * fail-open shape this guard exists to prevent.
 */
function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(
      `mutation "${label}" did not apply — the selftest fixture no longer matches ${PULLER}. ` +
        `The negative case is UNTESTED; fix the fixture rather than trusting this guard.`
    );
  }
  return out;
}

function selftest() {
  const failures = [];
  const real = realSource();

  // POSITIVE — real, unmutated source must be clean. If this fails the guard is wrong, not the code.
  const clean = auditTree(real);
  if (clean.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean.join(" | ")}`);

  // NEGATIVE — every check must actually reject its own defect, mutated into REAL source.
  const cases = [
    {
      label: "twin check on the WRONG column (the inert form)",
      mutated: () => mutate(real, "other.qbo_item_id = $3", "other.item_code = $3", "wrong twin column"),
      audit: auditAdopt,
      expect: "does not compare qbo_item_id",
    },
    {
      label: "twin check against the WRONG bound parameter",
      mutated: () => mutate(real, "other.qbo_item_id = $3", "other.qbo_item_id = $2", "wrong twin parameter"),
      audit: auditAdopt,
      expect: "does not compare qbo_item_id",
    },
    {
      label: "twin check not scoped by operating_company_id",
      mutated: () =>
        mutate(
          real,
          /WHERE other\.operating_company_id = \$1\s*\n\s*AND other\.qbo_item_id/,
          "WHERE other.qbo_item_id",
          "drop opco scoping"
        ),
      audit: auditAdopt,
      expect: "not scoped by operating_company_id",
    },
    {
      label: "twin check removed entirely",
      mutated: () => mutate(real, /AND NOT EXISTS \([\s\S]*?\)\n/, "", "remove twin check"),
      audit: auditAdopt,
      expect: "already claims this qbo_item_id",
    },
    {
      label: "adopt no longer requires qbo_item_id IS NULL",
      mutated: () => mutate(real, "AND qbo_item_id IS NULL", "AND qbo_item_id IS NOT DISTINCT FROM qbo_item_id", "drop unclaimed guard"),
      audit: auditAdopt,
      expect: "does not require qbo_item_id IS NULL",
    },
    {
      label: "upsert renames the twin (the original defect)",
      mutated: () =>
        mutate(real, "item_code = EXCLUDED.item_code,", "item_name = EXCLUDED.item_name,\n        item_code = EXCLUDED.item_code,", "reintroduce rename"),
      audit: auditUpsertKeepsName,
      expect: "assigns item_name",
    },
    {
      label: "upsert renames the twin via COALESCE (the form a substring check would miss)",
      mutated: () =>
        mutate(
          real,
          "item_code = EXCLUDED.item_code,",
          "item_name = COALESCE(EXCLUDED.item_name, catalogs.items.item_name),\n        item_code = EXCLUDED.item_code,",
          "reintroduce rename via COALESCE"
        ),
      audit: auditUpsertKeepsName,
      expect: "assigns item_name",
    },
  ];

  for (const c of cases) {
    let problems;
    try {
      problems = c.audit(c.mutated());
    } catch (err) {
      failures.push(`FAIL — ${c.label}: ${err.message}`);
      continue;
    }
    if (!problems.some((p) => p.includes(c.expect))) {
      failures.push(
        `FAIL — ${c.label} was NOT caught (expected a problem containing "${c.expect}"; got: ${problems.join(" | ") || "no problems"})`
      );
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — real source clean, and all ${cases.length} defect mutations rejected ` +
      `(wrong twin column, wrong parameter, unscoped probe, missing twin check, rebindable adopt, ` +
      `rename, rename-via-COALESCE). Every mutation verified to have applied.`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — the adopt stands down on a twin-claimed qbo_item_id (scoped, real column, real parameter), ` +
      `and the upsert never assigns item_name on conflict.`
  );
}

main();
