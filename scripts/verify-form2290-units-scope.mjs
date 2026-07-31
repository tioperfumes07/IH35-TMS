#!/usr/bin/env node
/**
 * Guard: every Form 2290 query against mdata.units must scope by ownership/lease, NEVER by a
 * per-entity company column that does not exist on that table (42703 → 500 at runtime).
 *
 * WHY THIS WAS REWRITTEN — the original guard had never once inspected the query it guards.
 * It did:      s.match(/FROM mdata\.units[\s\S]{0,400}?ORDER BY/)
 * and tested that single match for the forbidden identifier. Three failures compounded:
 *
 *   1. THE 400-CHAR WINDOW WAS SMALLER THAN THE REAL QUERY. The production query carries an
 *      explanatory comment between FROM and ORDER BY that pushes it past 400 characters, so the
 *      regex matched NOTHING on main and the guard printed OK. It was green because it found no
 *      query at all — the definition of a vacuous pass. Verified by running the original regex
 *      against origin/main: no match.
 *   2. IT FAILED OPEN. No match meant success. A guard whose "nothing found" verdict is PASS cannot
 *      distinguish "the code is correct" from "I never looked at the code."
 *   3. It read RAW text, so a COMMENT merely *naming* the forbidden column tripped it while a
 *      genuinely unsafe query sitting past the window sailed through — wrong in both directions at once.
 *
 * This version strips SQL comments (a comment is documentation, not a predicate), scans EVERY
 * mdata.units query rather than only the first, has no length window, and FAILS CLOSED when it finds
 * no query to inspect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/compliance/form-2290.routes.ts";
const FORBIDDEN = "operating_company_id";

/** A comment documents intent; it is never a SQL predicate. Strip before judging identifiers. */
export function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every `FROM mdata.units …` block, to the end of its template literal. No length cap. */
export function unitsQueries(source) {
  const out = [];
  const re = /FROM\s+mdata\.units\b/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const rest = source.slice(m.index);
    const end = rest.indexOf("`");
    out.push(end === -1 ? rest : rest.slice(0, end));
  }
  return out;
}

export function analyse(source) {
  const problems = [];
  const queries = unitsQueries(stripSqlComments(source));
  if (queries.length === 0) {
    // FAIL CLOSED. The original guard treated this as success, which is how it stayed green for its
    // entire life without ever reading a query.
    problems.push(
      `no 'FROM mdata.units' query found in ${FILE}. Either the file moved or this matcher is stale — ` +
        `refusing to report OK on a file the guard did not actually inspect.`
    );
    return { problems, queries };
  }
  queries.forEach((q, i) => {
    if (new RegExp(`\\b${FORBIDDEN}\\b`).test(q)) {
      problems.push(
        `mdata.units query #${i + 1} references ${FORBIDDEN}, which does not exist on that table ` +
          `(42703 → 500). Scope by owner_company_id / currently_leased_to_company_id instead.`
      );
    }
  });
  return { problems, queries };
}

export function run() {
  let source = "";
  try {
    source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  } catch {
    return { ok: false, message: `[verify-form2290-units-scope] FAILED\n  ✗ ${FILE} not found` };
  }
  const { problems, queries } = analyse(source);
  if (problems.length) {
    return { ok: false, message: `[verify-form2290-units-scope] FAILED\n${problems.map((p) => `  ✗ ${p}`).join("\n")}` };
  }
  return { ok: true, message: `[verify-form2290-units-scope] OK — ${queries.length} mdata.units query(ies) scoped by ownership/lease` };
}

function selftest() {
  let bad = 0;
  const t = (name, cond) => {
    if (!cond) {
      console.error(`  SELFTEST FAIL: ${name}`);
      bad++;
    }
  };
  const SAFE = "const q = `SELECT id FROM mdata.units WHERE owner_company_id = $1 ORDER BY unit_number`;";
  const UNSAFE = "const q = `SELECT id FROM mdata.units WHERE operating_company_id = $1 ORDER BY unit_number`;";
  const COMMENT_ONLY =
    "const q = `SELECT id FROM mdata.units\n  -- no operating_company_id here (42703)\n  WHERE owner_company_id = $1 ORDER BY unit_number`;";
  // Longer than the ORIGINAL guard's 400-char window — the exact shape that silently passed before.
  const LONG_UNSAFE =
    "const q = `SELECT id FROM mdata.units\n" +
    "  -- padding padding padding padding padding padding\n".repeat(12) +
    "  WHERE operating_company_id = $1 ORDER BY unit_number`;";

  t("safe query passes", analyse(SAFE).problems.length === 0);
  t("unsafe query fails", analyse(UNSAFE).problems.length === 1);
  t("a COMMENT naming the column is not a violation", analyse(COMMENT_ONLY).problems.length === 0);
  t("REGRESSION: unsafe query past the old 400-char window is caught", analyse(LONG_UNSAFE).problems.length === 1);
  t("no query at all FAILS CLOSED", analyse("const x = 1;").problems.length === 1);
  t("every query is scanned, not just the first", analyse(SAFE + "\n" + UNSAFE).problems.length === 1);
  // Mutation arms: each detector must be able to return the opposite answer.
  t("mutation: stripSqlComments removes a -- comment", stripSqlComments("a -- b").trim() === "a");
  t("mutation: unitsQueries finds two queries", unitsQueries(SAFE + "\n" + UNSAFE).length === 2);
  t("mutation: unitsQueries finds none in unrelated source", unitsQueries("const x = 1;").length === 0);
  return bad;
}

const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("verify-form2290-units-scope.mjs");
if (INVOKED_DIRECTLY) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(
      bad === 0 ? "[verify-form2290-units-scope] SELFTEST PASS — 9 cases" : `[verify-form2290-units-scope] SELFTEST FAILED (${bad})`
    );
    process.exit(bad === 0 ? 0 : 1);
  }
  const res = run();
  console.log(res.message);
  process.exit(res.ok ? 0 : 1);
}
