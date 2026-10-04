#!/usr/bin/env node
// AUTH-400 (CC-1, 2026-10-04) — the two append-only tables that refused every role (accounting.escrow_postings,
// dispatch.stop_arrivals) admit ONE thing: DELETE of a row listed in _system.purge_authorized_rows for the AUTH named in
// app.purge_auth_id (ARM L, the arm every other WORM table already has). UPDATE stays refused; no AUTH or an unlisted
// row stays refused. Fork rehearsal (rolled back): 7/7 cases as specified.
// static (read-only) + --selftest plants (arm without the AUTH format, arm without the listed-row check, UPDATE admitted).
import { readFileSync } from "node:fs";

const LABEL = "verify-append-only-purge-arm-is-listed-only";
const MIG = "db/migrations/202615410200_append_only_tables_admit_auth_listed_purge.sql";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

export function problems(sql) {
  const p = [];
  for (const [fn, table] of [["accounting.prevent_escrow_posting_mutation", "accounting.escrow_postings"], ["dispatch.stop_arrivals_delete_block", "dispatch.stop_arrivals"]]) {
    const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${fn}()`);
    if (at < 0) { p.push(`${fn} missing`); continue; }
    const body = sql.slice(at, sql.indexOf("$fn$;", at));
    if (!/v_auth ~ '\^AUTH-\[0-9\]\+\$'/.test(body)) p.push(`${fn}: arm must require app.purge_auth_id ~ ^AUTH-[0-9]+$`);
    if (!new RegExp(`r\\.auth_id = v_auth AND r\\.table_name = '${table.replace(".", "\\.")}' AND r\\.row_pk = \\(to_jsonb\\(OLD\\) ->> 'id'\\)`).test(body)) p.push(`${fn}: arm must require the row listed for this AUTH`);
    if (!/RAISE EXCEPTION/.test(body.slice(body.lastIndexOf("END IF;")))) p.push(`${fn}: must still refuse after the arm`);
    if (fn.includes("escrow") && !/IF TG_OP = 'DELETE' AND/.test(body)) p.push(`${fn}: the arm must be DELETE-only (UPDATE stays refused)`);
  }
  return p;
}

const sql = read(MIG);
const own = problems(sql);
const plants = [
  ["no AUTH format", sql.replace(/v_auth ~ '\^AUTH-\[0-9\]\+\$' AND/, "true AND")],
  ["no listed-row check", sql.replace("r.table_name = 'dispatch.stop_arrivals' AND r.row_pk = (to_jsonb(OLD) ->> 'id')", "true")],
  ["UPDATE admitted", sql.replace("IF TG_OP = 'DELETE' AND", "IF")],
];
const missed = plants.filter(([, s]) => problems(s).length === 0).map(([n]) => n);
if (own.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...own, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ARM L is DELETE-only, AUTH-format-gated, listed-row-gated on both tables (${plants.length}/${plants.length} plants caught)`);
