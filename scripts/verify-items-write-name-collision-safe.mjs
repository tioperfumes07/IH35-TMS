#!/usr/bin/env node
/**
 * ACCT-F83 — every QBO-sourced write of catalogs.items.item_name must prove the name is FREE first.
 *
 * WHY THIS EXISTS (verified live on prod br-fancy-credit-akjnd07a, 2026-08-02):
 * catalogs.items carries three unique indexes, and only one of them is total:
 *   uq_items_company_item_name    (operating_company_id, item_name)                      [NOT partial]
 *   uq_items_company_item_code    (operating_company_id, item_code)  WHERE code NOT NULL [partial]
 *   uq_items_company_qbo_item_id  (operating_company_id, qbo_item_id) WHERE id NOT NULL  [partial]
 * The sync is keyed on qbo_item_id, so item_name is the constraint nobody is thinking about — and it
 * is the one that fires. A violation aborts the ENTIRE step for that entity, not one row.
 *
 * THREE writes carried this defect. Each was reproduced on a fork of prod before being fixed:
 *   1. reconciler HEAL   `SET item_name = qi.name` renamed a '[QBO n]' twin onto a taken name.
 *                        qbo_sync.step.items_reconcile had last_successful_run_at = NULL — it had
 *                        NEVER succeeded, on TRANSP, since the step existed.
 *   2. reconciler INSERT wrote qi.name raw, deduping only on qbo_item_id. TRK: mirror qbo_id 179
 *                        'Freight' vs local 'Freight' (qbo_id 12).
 *   3. puller INSERT     same bare name, reached whenever ACCT-F77's adopt stands down because the
 *                        name is held by a row bound to a DIFFERENT qbo id. Same TRK row.
 * #3988 fixed a fourth instance (the puller's DO UPDATE) and the class survived in these three. That
 * is the whole reason this guard checks a CLASS and not a line: the previous fix was correct and the
 * bug still shipped, one file over.
 *
 * WHAT IT CHECKS — the EXPANDED SQL, not the source text. The safety lives in helper functions
 * (nameIsFree/codeIsFree), so asserting "the source calls nameIsFree" would pass even if the helper
 * were gutted to `return "TRUE"`. This guard bundles the module and reads the strings the database
 * actually receives.
 *
 * SAFETY PROPERTIES PROTECTED:
 *   a. no QBO-sourced statement assigns item_name without a name-free test in the same statement;
 *   b. the free-test carries BOTH clauses — the cross-row one AND the peer/mirror one that catches the
 *      intra-statement collision two same-named QBO items would cause (no EXISTS can see a write made
 *      by its own statement);
 *   c. the heal gates the rename in its WHERE too, so declined renames are not counted as work done
 *      forever (a drift counter that never converges is a lying counter);
 *   d. the SQL stays in items-write-sql.ts — no qbo-sync file re-inlines a raw catalogs.items write,
 *      which is how instance 3 escaped the fix for instance 4.
 *
 * OUT OF SCOPE, deliberately and on the record: catalogs/items.routes.ts writes item_name from
 * operator input. A duplicate there fails ONE interactive request visibly; it does not abort a batch
 * sync, and it is the operator's own name to choose. Different class, tracked separately — widening
 * this guard to cover it would force a rename convention onto hand-created items that no one has ruled on.
 */
import { build } from "esbuild";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_MODULE = "apps/backend/src/qbo-sync/items-write-sql.ts";
const QBO_SYNC_DIR = "apps/backend/src/qbo-sync";
const LABEL = "verify-items-write-name-collision-safe";

/** Statements that write item_name from QBO data. Each must survive every check below. */
const WRITING_CONSTANTS = ["HEAL_ITEM_DRIFT_SQL", "CREATE_MISSING_ITEMS_SQL", "PULLER_UPSERT_ITEM_SQL"];
/** Set-based statements: these alone can collide with themselves inside one statement. */
const SET_BASED = ["HEAL_ITEM_DRIFT_SQL", "CREATE_MISSING_ITEMS_SQL"];

async function expand(sourceText) {
  const tmpTs = join(tmpdir(), `items-write-sql.${process.pid}.${Math.abs(hash(sourceText))}.ts`);
  const tmpMjs = `${tmpTs}.mjs`;
  writeFileSync(tmpTs, sourceText);
  try {
    await build({ entryPoints: [tmpTs], outfile: tmpMjs, format: "esm", bundle: true, platform: "node", logLevel: "silent" });
    return await import(`file://${tmpMjs}`);
  } finally {
    rmSync(tmpTs, { force: true });
    rmSync(tmpMjs, { force: true });
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Strip SQL line comments so a rationale mentioning `item_name = qi.name` is not read as code. */
function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

export async function auditSql(sourceText, siblingFiles) {
  const problems = [];
  let mod;
  try {
    mod = await expand(sourceText);
  } catch (err) {
    return [`${SQL_MODULE}: could not be bundled/evaluated (${String(err?.message ?? err)}) — cannot verify.`];
  }

  for (const name of WRITING_CONSTANTS) {
    const raw = mod[name];
    if (typeof raw !== "string") {
      problems.push(
        `${SQL_MODULE}: ${name} is missing or is not a SQL string. This guard's anchor is gone, so the ` +
          `name-collision checks below cannot run — re-point the guard at wherever the statement moved ` +
          `rather than letting it pass silently.`
      );
      continue;
    }
    const sql = stripSqlComments(raw);
    const writesName = /item_name\s*=\s*[^,\n]+/i.test(sql) || /INSERT\s+INTO\s+catalogs\.items\s*\([^)]*item_name/i.test(sql);
    if (!writesName) continue;

    // (a) the bug in its exact original form.
    //
    // The lookbehind is load-bearing: the name-free test itself contains `other.item_name = qi.name`
    // as a COMPARISON. Without excluding an alias-qualified left side, this check flags the fix as if
    // it were the bug — which it did on first run. An assignment is unqualified (`item_name = ...` in
    // a SET or an INSERT column list); a comparison here is always `<alias>.item_name = ...`.
    if (/(?<![.\w])item_name\s*=\s*qi\.name\s*(,|$)/im.test(sql)) {
      problems.push(
        `${SQL_MODULE}: ${name} assigns item_name = qi.name unconditionally. This is the ACCT-F83 defect ` +
          `verbatim — it renames a '[QBO n]' twin onto a name another row already holds and aborts the ` +
          `whole sync step on uq_items_company_item_name.`
      );
    }

    // (b) a name-free test must be present in the same statement.
    const hasFreeTest =
      /NOT\s+EXISTS\s*\([\s\S]*?FROM\s+catalogs\.items\s+other[\s\S]*?item_name\s*=/i.test(sql) ||
      /NOT\s+EXISTS\s*\([\s\S]*?FROM\s+catalogs\.items\s+other[\s\S]*?other\.item_name/i.test(sql);
    if (!hasFreeTest) {
      problems.push(
        `${SQL_MODULE}: ${name} writes item_name with no "is this name already taken in this entity" ` +
          `test. uq_items_company_item_name is NOT partial, so every such write is constraint-bearing.`
      );
    }

    // (c) it must be able to land SOMEWHERE — either it disambiguates, or it declines the write.
    const disambiguates = /\[QBO\s*'/i.test(sql) || /\|\|\s*'\s*\[QBO/i.test(sql);
    const declines = /ELSE\s+ci\.item_name/i.test(sql);
    if (!disambiguates && !declines) {
      problems.push(
        `${SQL_MODULE}: ${name} tests the name but neither disambiguates it (the '[QBO n]' suffix already ` +
          `used by prod rows) nor stands down (ELSE ci.item_name). It would still write a colliding name.`
      );
    }
  }

  // (d) set-based statements need the peer/mirror clause for the intra-statement collision.
  for (const name of SET_BASED) {
    const raw = mod[name];
    if (typeof raw !== "string") continue; // already reported above
    const sql = stripSqlComments(raw);
    // Must be the NAME peer clause specifically. A bare /qbo_items peer/ test was satisfied by the
    // item_code peer clause, so deleting the name one went undetected — the guard has to enumerate the
    // column it is actually protecting.
    if (!/FROM\s+mdata\.qbo_items\s+peer[\s\S]{0,240}?peer\.name\s*=\s*qi\.name/i.test(sql)) {
      problems.push(
        `${SQL_MODULE}: ${name} is set-based but carries no "peer" check against mdata.qbo_items. Two QBO ` +
          `items sharing a name in one entity would both resolve to the same bare name inside a single ` +
          `statement — no EXISTS can see a row its own statement is inserting. TRK really does carry two ` +
          `mirror rows named 'Freight' (qbo_id 12 and 179), verified on prod.`
      );
    }
  }

  // (e) the heal must gate the rename in the WHERE as well as the SET, or declined renames are
  //     re-counted as "healed" on every run forever.
  const heal = typeof mod.HEAL_ITEM_DRIFT_SQL === "string" ? stripSqlComments(mod.HEAL_ITEM_DRIFT_SQL) : "";
  if (heal) {
    const whereIdx = heal.search(/\bWHERE\b/i);
    const whereClause = whereIdx >= 0 ? heal.slice(whereIdx) : "";
    const gatedInWhere = /item_name\s+IS\s+DISTINCT\s+FROM\s+qi\.name\s+AND[\s\S]*?NOT\s+EXISTS/i.test(whereClause);
    if (!gatedInWhere) {
      problems.push(
        `${SQL_MODULE}: HEAL_ITEM_DRIFT_SQL does not gate the name-drift branch of its WHERE with the ` +
          `name-free test. Rows whose rename is declined would match "name drift" on every run, be ` +
          `counted as healed, and change nothing — the step would never converge.`
      );
    }
  }

  // (f) no qbo-sync file may re-inline a raw catalogs.items write.
  for (const [rel, content] of siblingFiles) {
    const code = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    if (/INSERT\s+INTO\s+catalogs\.items/i.test(code) || /UPDATE\s+catalogs\.items[\s\S]{0,400}?\bitem_name\s*=/i.test(code)) {
      problems.push(
        `${rel}: writes catalogs.item_name with SQL inlined in the file instead of using the reviewed ` +
          `builders in ${SQL_MODULE}. Every inline copy is a place the name-free test has to be ` +
          `remembered again, which is exactly how this defect survived its own first fix.`
      );
    }
  }
  return problems;
}

function siblingSources() {
  const dir = join(ROOT, QBO_SYNC_DIR);
  const out = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    if (f === "items-write-sql.ts") continue; // the reviewed home of this SQL
    if (/\.test\.ts$/.test(f)) continue; // tests may contain illustrative SQL
    out.set(`${QBO_SYNC_DIR}/${f}`, readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

async function auditTree() {
  return auditSql(readFileSync(join(ROOT, SQL_MODULE), "utf8"), siblingSources());
}

async function selftest() {
  const failures = [];
  const real = readFileSync(join(ROOT, SQL_MODULE), "utf8");
  const clean = siblingSources();

  const clean0 = await auditTree();
  if (clean0.length !== 0) failures.push(`case0 FAIL — real source flagged: ${clean0.join(" | ")}`);

  // case1 — reintroduce the exact ACCT-F83 defect in the heal.
  const bugHeal = real.replace(
    /item_name = CASE WHEN \$\{nameIsFree\("ci\.id"\)\} THEN qi\.name ELSE ci\.item_name END,/,
    "item_name = qi.name,"
  );
  if (bugHeal === real) failures.push("case1 SETUP FAIL — could not locate the heal's guarded assignment to mutate");
  else if (!(await auditSql(bugHeal, clean)).some((p) => p.includes("unconditionally")))
    failures.push("case1 FAIL — an unconditional item_name = qi.name in the heal was NOT caught");

  // case2 — gut the shared helper. The source still *calls* nameIsFree, so any guard that only checked
  // for the call site would pass this. This is the case that justifies expanding the SQL.
  const gutted = real.replace(
    /export function nameIsFree\(self: "NULL" \| "ci\.id"\): string \{[\s\S]*?\n\}/,
    'export function nameIsFree(_self: "NULL" | "ci.id"): string {\n  return " TRUE ";\n}'
  );
  if (gutted === real) failures.push("case2 SETUP FAIL — could not locate nameIsFree to gut");
  else {
    const found = await auditSql(gutted, clean);
    if (!found.some((p) => p.includes("no \"is this name already taken") || p.includes("peer")))
      failures.push("case2 FAIL — a gutted nameIsFree helper was NOT caught");
  }

  // case3 — drop the peer clause only (intra-statement collision returns).
  const noPeer = real.replace(
    /\n  AND NOT EXISTS \(\n    SELECT 1 FROM mdata\.qbo_items peer\n     WHERE peer\.operating_company_id = qi\.operating_company_id\n       AND peer\.name = qi\.name\n       AND peer\.qbo_id IS DISTINCT FROM qi\.qbo_id\n  \)/,
    ""
  );
  if (noPeer === real) failures.push("case3 SETUP FAIL — could not locate the peer clause to remove");
  else if (!(await auditSql(noPeer, clean)).some((p) => p.includes("peer")))
    failures.push("case3 FAIL — removing the peer/mirror clause was NOT caught");

  // case4 — remove the WHERE gate so declined renames churn forever.
  const noWhereGate = real.replace(
    /OR \(ci\.item_name IS DISTINCT FROM qi\.name AND \$\{nameIsFree\("ci\.id"\)\}\)/,
    "OR (ci.item_name IS DISTINCT FROM qi.name)"
  );
  if (noWhereGate === real) failures.push("case4 SETUP FAIL — could not locate the WHERE gate to remove");
  else if (!(await auditSql(noWhereGate, clean)).some((p) => p.includes("never converge")))
    failures.push("case4 FAIL — an ungated name-drift WHERE branch was NOT caught");

  // case5 — a constant disappearing must fail closed, not pass by absence.
  const noConst = real.replace("export const PULLER_UPSERT_ITEM_SQL", "const PULLER_UPSERT_ITEM_SQL_UNUSED");
  if (!(await auditSql(noConst, clean)).some((p) => p.includes("anchor is gone")))
    failures.push("case5 FAIL — a missing statement constant did NOT fail closed");

  // case6 — a sibling re-inlining raw SQL must be caught.
  const dirty = new Map(clean);
  dirty.set(
    `${QBO_SYNC_DIR}/items-reconciler.ts`,
    "await client.query(`INSERT INTO catalogs.items (operating_company_id, item_name) VALUES ($1,$2)`);"
  );
  if (!(await auditSql(real, dirty)).some((p) => p.includes("inlined in the file")))
    failures.push("case6 FAIL — a re-inlined raw catalogs.items write was NOT caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — unconditional rename caught, gutted helper caught, peer-clause removal caught, ` +
      `ungated WHERE caught, missing constant fails closed, re-inlined SQL caught`
  );
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = await auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every QBO-sourced item_name write proves the name is free, in the statement that writes it`);
}

await main();
