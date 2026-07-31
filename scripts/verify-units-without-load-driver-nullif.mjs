#!/usr/bin/env node
/**
 * GUARD — the units-without-load driver name must be NULL when absent, never the empty string.
 *
 * THE BUG. CONCAT_WS NEVER RETURNS NULL. With every argument NULL it returns the EMPTY STRING —
 * verified on prod: CONCAT_WS(' ',NULL,NULL) IS NULL -> false, = '' -> true. The endpoint selected
 * CONCAT_WS(' ', ud.first_name, ud.last_name) AS driver_name, so a unit with no driver arrived as "".
 * The client's `driver_name ?? "—"` could not catch it, because ?? fires only on null/undefined. The
 * Unassigned Units panel therefore rendered "T171 · · Need load" — two separators around nothing. 50
 * units on prod have no assigned driver, so this was EVERY row in that panel.
 *
 * This is a nasty shape because both halves look correct in isolation: the SQL is idiomatic, and the ??
 * fallback is the modern, "safer" operator. It is the INTERACTION that fails — ?? is strictly narrower
 * than ||, and CONCAT_WS is one of the few SQL functions that returns '' where NULL is expected.
 *
 * ASSERTED: the units-without-load query wraps its driver_name CONCAT_WS in NULLIF(..., '').
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:units-without-load-driver-nullif";
const FILE = "apps/backend/src/dispatch/loads.routes.ts";

/** Strip SQL line comments so prose ABOUT CONCAT_WS is not read as a query. */
export function stripSqlComments(s) {
  return s.split("\n").map((l) => { const i = l.indexOf("--"); return i >= 0 ? l.slice(0, i) : l; }).join("\n");
}

export function analyse(source) {
  const s = stripSqlComments(source);
  const problems = [];
  const bare = s.match(/(?<!NULLIF\()\bCONCAT_WS\([^)]*\)\s+AS\s+driver_name/gi) || [];
  const wrapped = s.match(/NULLIF\(\s*CONCAT_WS\([^)]*\)\s*,\s*''\s*\)\s+AS\s+driver_name/gi) || [];
  if (wrapped.length === 0) {
    problems.push(
      `${FILE}: no NULLIF(CONCAT_WS(...), '') AS driver_name found. CONCAT_WS returns '' (never NULL) when ` +
        `all name parts are NULL, so a driverless unit renders as an empty field between two separators.`
    );
  }
  for (const hit of bare) {
    if (!wrapped.some((w) => w.includes(hit))) {
      problems.push(`${FILE}: unwrapped driver_name projection -> ${hit.trim()}`);
    }
  }
  return problems;
}

export function run() {
  let src = "";
  try {
    src = readFileSync(path.join(ROOT, FILE), "utf8");
  } catch (e) {
    return { ok: false, message: `${LABEL} FAILED:\n  - cannot read ${FILE} (${e.message})` };
  }
  const problems = analyse(src);
  if (problems.length) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return { ok: true, message: `${LABEL} OK — driver_name is NULL when absent, not an empty string` };
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  const BARE = "CONCAT_WS(' ', ud.first_name, ud.last_name) AS driver_name,";
  const GOOD = "NULLIF(CONCAT_WS(' ', ud.first_name, ud.last_name), '') AS driver_name,";
  const PROSE = "-- CONCAT_WS(' ', a, b) AS driver_name is wrong\n" + GOOD;

  t("the ORIGINAL bare projection is caught", analyse(BARE).length >= 1);
  t("the NULLIF-wrapped projection passes", analyse(GOOD).length === 0);
  t("a comment mentioning the bad form is not a violation", analyse(PROSE).length === 0);
  t("absent projection FAILS CLOSED", analyse("SELECT 1").length === 1);
  t("mutation: stripSqlComments removes a -- line", stripSqlComments("x -- y").trim() === "x");
  return bad;
}

const DIRECT = process.argv[1] && process.argv[1].endsWith("verify-units-without-load-driver-nullif.mjs");
if (DIRECT) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 5 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const r = run();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
