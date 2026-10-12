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
 *
 * ACCT-F4431380 (Lead 443.137 item 9e) — OLD: asserted the puller's catalogs.items ADOPT stood down on a
 * twin-claimed qbo_item_id (scoped, real column, real parameter) and that the upsert (in items-write-sql.ts)
 * never assigned item_name on conflict. NEW: both failure modes are made impossible rather than handled —
 * the puller contains NO catalogs.items adopt UPDATE and NO catalogs.items upsert (it writes only
 * mdata.qbo_items), and reconcileItems() (the items_reconcile step that also aborted) REFUSES BY NAME via
 * refuseQboNativeWrite(). Mutations are still applied to the REAL files and proven to have applied.
 * WHY: QuickBooks is a read-only archive; the native write was removed and the reconciler refuses by name.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PULLER = "apps/backend/src/qbo-sync/items-puller.ts";
const RECONCILER = "apps/backend/src/qbo-sync/items-reconciler.ts";
const LABEL = "verify-no-generic-seed-shadowing-qbo-items";

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, "");
}

/** Invariant 1 (was: adopt stands down on a twin) — there is no adopt at all. */
export function auditAdopt(src) {
  const code = stripComments(src);
  const problems = [];
  if (/UPDATE\s+catalogs\.items\b/i.test(code)) {
    problems.push(
      `${PULLER}: contains an UPDATE of catalogs.items (an adopt/rebind). A QBO pull may not stamp a QBO id ` +
        `onto, or rename, a native item — QuickBooks is a read-only archive (ACCT-F4431380).`
    );
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_items\b/i.test(code)) {
    problems.push(`${PULLER}: no INSERT INTO mdata.qbo_items — the pull no longer fills its mirror; cannot verify (fails closed).`);
  }
  return problems;
}

/** Invariant 2 (was: upsert never assigns item_name on conflict) — there is no upsert at all. */
export function auditUpsertKeepsName(src) {
  const code = stripComments(src);
  const problems = [];
  if (/INSERT\s+INTO\s+catalogs\.items\b/i.test(code) || /PULLER_UPSERT_ITEM_SQL/.test(code)) {
    problems.push(
      `${PULLER}: inserts/upserts catalogs.items from QuickBooks (inline or via PULLER_UPSERT_ITEM_SQL). ` +
        `The upsert that renamed twins is removed; a QBO pull writes only mdata.qbo_items.`
    );
  }
  return problems;
}

/** Invariant 3 — the items_reconcile step refuses by name and writes no native item. */
export function auditReconcilerRefuses(src) {
  const code = stripComments(src);
  const problems = [];
  const m = /^export\s+async\s+function\s+reconcileItems\b[\s\S]*?\n\}/m.exec(code);
  if (!m) problems.push(`${RECONCILER}: reconcileItems() missing — callers would get an import error, not a named refusal.`);
  else if (!/\brefuseQboNativeWrite\s*\(/.test(m[0])) {
    problems.push(`${RECONCILER}: reconcileItems() does not call refuseQboNativeWrite() — a silent no-op or a native write.`);
  }
  if (/(?:INSERT\s+INTO|UPDATE)\s+catalogs\.items\b/i.test(code) || /(HEAL_ITEM_DRIFT_SQL|CREATE_MISSING_ITEMS_SQL)/.test(code)) {
    problems.push(`${RECONCILER}: writes catalogs.items (inline or via the removed items-write-sql constants).`);
  }
  return problems;
}

const realPuller = () => readFileSync(join(ROOT, PULLER), "utf8");
const realReconciler = () => readFileSync(join(ROOT, RECONCILER), "utf8");

function auditTree() {
  const p = realPuller();
  return [...auditAdopt(p), ...auditUpsertKeepsName(p), ...auditReconcilerRefuses(realReconciler())];
}

/** Apply a mutation to real source and PROVE it applied (a silent no-op mutation is an untested case). */
function mutate(src, from, to, label) {
  const out = src.replace(from, to);
  if (out === src) {
    throw new Error(`mutation "${label}" did not apply — the selftest fixture no longer matches the real file; the negative case is UNTESTED.`);
  }
  return out;
}

function selftest() {
  const failures = [];
  const clean = auditTree();
  if (clean.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean.join(" | ")}`);

  const puller = realPuller();
  const reconciler = realReconciler();
  const ANCHOR = /\nexport async function pullItemsFromQbo/;
  const cases = [
    {
      label: "the ACCT-F77 adopt (with its twin check) re-added to the real puller",
      mutated: () =>
        mutate(puller, ANCHOR, "\nconst ADOPT = `UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 AND qbo_item_id IS NULL AND NOT EXISTS (SELECT 1 FROM catalogs.items other WHERE other.operating_company_id = $1 AND other.qbo_item_id = $3) RETURNING id`;\nexport async function pullItemsFromQbo", "re-add adopt"),
      audit: auditAdopt,
      expect: "UPDATE of catalogs.items",
    },
    {
      label: "the twin-renaming upsert re-added to the real puller",
      mutated: () =>
        mutate(puller, ANCHOR, "\nconst UPSERT = `INSERT INTO catalogs.items (operating_company_id, item_name) VALUES ($1,$2) ON CONFLICT (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL DO UPDATE SET item_name = EXCLUDED.item_name`;\nexport async function pullItemsFromQbo", "re-add upsert"),
      audit: auditUpsertKeepsName,
      expect: "inserts/upserts catalogs.items",
    },
    {
      label: "the puller re-wired to PULLER_UPSERT_ITEM_SQL",
      mutated: () => mutate(puller, ANCHOR, "\nconst Q = PULLER_UPSERT_ITEM_SQL;\nexport async function pullItemsFromQbo", "re-wire const"),
      audit: auditUpsertKeepsName,
      expect: "inserts/upserts catalogs.items",
    },
    {
      label: "mirror write removed (instrument must fail closed)",
      mutated: () => mutate(puller, /INSERT INTO mdata\.qbo_items/, "INSERT INTO mdata.qbo_items_gone", "drop mirror"),
      audit: auditAdopt,
      expect: "no INSERT INTO mdata.qbo_items",
    },
    {
      label: "reconcileItems refusal reverted to a silent no-op",
      mutated: () => mutate(reconciler, /return refuseQboNativeWrite\([^;]*\);/, "return { driftDetected: 0, createdFromQbo: 0, healed: 0, localOnly: 0, nameConflictsRetained: 0, reconciledAt: '' };", "revert refusal"),
      audit: auditReconcilerRefuses,
      expect: "does not call refuseQboNativeWrite",
    },
    {
      label: "reconciler re-gains the ACCT-F83 heal",
      mutated: () => mutate(reconciler, /\nexport type ItemsSyncStatus/, "\nconst H = `UPDATE catalogs.items ci SET item_name = qi.name FROM mdata.qbo_items qi`;\nexport type ItemsSyncStatus", "re-add heal"),
      audit: auditReconcilerRefuses,
      expect: "writes catalogs.items",
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
      failures.push(`FAIL — ${c.label} was NOT caught (expected "${c.expect}"; got: ${problems.join(" | ") || "no problems"})`);
    }
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — real sources clean, and all ${cases.length} mutations of the REAL files rejected (every mutation verified to have applied).`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the items pull neither adopts nor upserts catalogs.items (mirror only), and reconcileItems() refuses by name.`);
}

main();
