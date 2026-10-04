#!/usr/bin/env node
// AUTH-400 (CC-1, 2026-10-04) — the two append-only tables that refused every role (accounting.escrow_postings,
// dispatch.stop_arrivals) admit ONE thing: DELETE of a row listed in _system.purge_authorized_rows for the AUTH named in
// app.purge_auth_id (ARM L, the arm every other WORM table already has). UPDATE stays refused; no AUTH or an unlisted
// row stays refused. Fork rehearsal (rolled back): 7/7 cases as specified.
// static (read-only) + --selftest plants (arm without the AUTH format, arm without the listed-row check, UPDATE admitted).
import { readFileSync } from "node:fs";

const LABEL = "verify-append-only-purge-arm-is-listed-only";
const MIG = "db/migrations/202615410200_append_only_tables_admit_auth_listed_purge.sql";
const SNAP = "db/migrations/202615410400_cash_basis_snapshot_admits_auth_listed_purge.sql";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

export function snapshotProblems(sql) {
  const p = [];
  const at = sql.indexOf("CREATE OR REPLACE FUNCTION accounting.period_cash_basis_snapshot_block_mutation()");
  if (at < 0) return ["accounting.period_cash_basis_snapshot_block_mutation missing"];
  const body = sql.slice(at);
  if (!/v_auth ~ '\^AUTH-\[0-9\]\+\$'/.test(body)) p.push("snapshot arm must require app.purge_auth_id ~ ^AUTH-[0-9]+$");
  if (!/r\.table_name = 'accounting\.period_cash_basis_snapshot'\s*\n\s*AND r\.row_pk = \(to_jsonb\(OLD\) ->> 'id'\)/.test(body)) p.push("snapshot arm must require the row listed for this AUTH");
  const upd = body.slice(body.indexOf("IF TG_OP = 'UPDATE' AND OLD.computed_at IS NOT NULL THEN"), body.indexOf("IF TG_OP = 'DELETE' AND OLD.computed_at IS NOT NULL THEN"));
  if (!/RAISE EXCEPTION 'IH35_CASH_BASIS_SNAPSHOT_LOCKED/.test(upd) || /purge_authorized_rows/.test(upd)) p.push("UPDATE of a computed snapshot must stay refused for every role (no arm)");
  return p;
}

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
const snap = read(SNAP);
const own = [...problems(sql), ...snapshotProblems(snap)];
const plants = [
  ["no AUTH format", sql.replace(/v_auth ~ '\^AUTH-\[0-9\]\+\$' AND/, "true AND")],
  ["no listed-row check", sql.replace("r.table_name = 'dispatch.stop_arrivals' AND r.row_pk = (to_jsonb(OLD) ->> 'id')", "true")],
  ["UPDATE admitted", sql.replace("IF TG_OP = 'DELETE' AND", "IF")],
];
const missed = plants.filter(([, s]) => problems(s).length === 0).map(([n]) => n);
const snapPlants = [
  ["snapshot arm without the AUTH format", snap.replace(/v_auth ~ '\^AUTH-\[0-9\]\+\$' AND/, "true AND")],
  ["snapshot UPDATE admitted", snap.replace("IF TG_OP = 'UPDATE' AND OLD.computed_at IS NOT NULL THEN\n    RAISE", "IF TG_OP = 'UPDATE' AND OLD.computed_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _system.purge_authorized_rows) THEN\n    RAISE")],
];
for (const [n, src] of snapPlants) if (snapshotProblems(src).length === 0) missed.push(n);
if (own.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...own, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ARM L is DELETE-only, AUTH-format-gated, listed-row-gated on escrow_postings, stop_arrivals and the cash-basis snapshot (${plants.length + snapPlants.length}/${plants.length + snapPlants.length} plants caught)`);
