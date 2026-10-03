#!/usr/bin/env node
/**
 * verify-no-posting-update-outside-document-edit — ROUND 363-CC1-D (LAW 363.3 / 363.5), CC-1.
 *
 * A posted accounting.journal_entry_postings line is never moved in place. It moves only by restating its document:
 * the reclassify engine (a RECLASSIFICATION entry reversing the old side and posting the new, document rewritten in the
 * same transaction) or void-and-reissue.
 *
 * STATIC — every writer, every file under apps/backend/src and scripts (tests excluded):
 *   RULE 1 — an UPDATE of accounting.journal_entry_postings sets only bookkeeping columns (description, updated_at,
 *            idempotency_key, source_trace_key, register_cleared*) or link columns that fill once from NULL
 *            (source_transaction_type/id/line_id, load_id, reversed_by_line_id). Account, amount, side, company, JE,
 *            class, location, entity, batch and reversal pointer are never SET.
 *   RULE 2 — the reclassify engine never UPDATEs a posting (it posts a reclassification entry).
 * LIVE (direct endpoint, read-only), once migration 202615360200 is applied:
 *   RULE 3 — trg_refuse_posting_fact_update is installed and enabled BEFORE UPDATE on journal_entry_postings, and its
 *            function refuses account_id and amount_cents.
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the refusal lives in the database — fails closed without one";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-posting-update-outside-document-edit";
const SELF = "scripts/verify-no-posting-update-outside-document-edit.mjs";

export const BOOKKEEPING = new Set(["description", "updated_at", "idempotency_key", "source_trace_key", "register_cleared", "register_cleared_at", "register_cleared_by_user_id"]);
export const LINK_ONCE = new Set(["source_transaction_type", "source_transaction_id", "source_transaction_line_id", "load_id", "reversed_by_line_id"]);

const UPDATE_RE = /UPDATE\s+accounting\.journal_entry_postings\b(?:\s+(?:AS\s+)?(?!SET\b)([a-z_][a-z0-9_]*))?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|\bFROM\b|\bRETURNING\b|`|"|$)/gi;

/** Columns assigned in one SET list (top-level commas only; alias prefixes stripped). */
export function setColumns(setList) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of setList) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out
    .map((a) => a.split("=")[0].trim().replace(/^[a-z_][a-z0-9_]*\./i, "").replace(/"/g, ""))
    .filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c));
}

export function fileFailures(rel, src) {
  const out = [];
  for (const m of src.matchAll(UPDATE_RE)) {
    const line = src.slice(0, m.index).split("\n").length;
    const cols = setColumns(m[2]);
    const bad = cols.filter((c) => !BOOKKEEPING.has(c) && !LINK_ONCE.has(c));
    if (bad.length) out.push(`RULE 1 ${rel}:${line} moves a posting in place (SET ${bad.join(", ")}) — restate the document (reclassify engine / void-and-reissue)`);
    if (/accounting\/reclassify\//.test(rel)) out.push(`RULE 2 ${rel}:${line} the reclassify engine UPDATEs a posting — it must post a reclassification entry`);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== "__tests__" && name !== "fixtures") walk(p, acc); }
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !/\.(test|spec)\.[mc]?[jt]s$/.test(name)) acc.push(p);
  }
  return acc;
}

export function run() {
  const out = [];
  for (const base of ["apps/backend/src", "scripts"]) {
    for (const abs of walk(join(ROOT, base))) {
      const rel = relative(ROOT, abs);
      if (rel === SELF) continue;
      const src = readFileSync(abs, "utf8");
      if (!/journal_entry_postings/.test(src)) continue;
      // guards that plant a mutant UPDATE inside a rolled-back transaction to prove a trigger refuses it are not writers
      if (/^scripts\/verify-/.test(rel) && /ROLLBACK/.test(src) && !/^scripts\/verify-steps\//.test(rel)) continue;
      out.push(...fileFailures(rel, src));
    }
  }
  return out;
}

export function liveFailures(m) {
  if (!m.applied) return [];
  const out = [];
  if (!m.trigger) out.push("RULE 3 trg_refuse_posting_fact_update is not installed on accounting.journal_entry_postings");
  else {
    if (m.trigger.enabled === "D") out.push("RULE 3 trg_refuse_posting_fact_update is DISABLED");
    if (!m.trigger.before_update) out.push("RULE 3 trg_refuse_posting_fact_update is not BEFORE UPDATE");
    if (!m.refusesAccount || !m.refusesAmount) out.push("RULE 3 refuse_posting_fact_update no longer refuses account_id and amount_cents");
  }
  return out;
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  const applied = (await client.query(`SELECT 1 FROM _system._schema_migrations WHERE filename LIKE '202615360200%'`)).rows.length > 0;
  const t = (await client.query(`
    SELECT t.tgenabled AS enabled, (t.tgtype & 2 = 2 AND t.tgtype & 16 = 16) AS before_update, pg_get_functiondef(t.tgfoid) AS def
      FROM pg_trigger t WHERE t.tgrelid = 'accounting.journal_entry_postings'::regclass AND t.tgname = 'trg_refuse_posting_fact_update'`)).rows[0];
  await client.query("ROLLBACK");
  return {
    applied,
    trigger: t ? { enabled: t.enabled, before_update: t.before_update } : null,
    refusesAccount: !!t && /NEW\.account_id IS DISTINCT FROM OLD\.account_id/.test(t.def),
    refusesAmount: !!t && /NEW\.amount_cents IS DISTINCT FROM OLD\.amount_cents/.test(t.def),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const ok = (src, rel = "apps/backend/src/x.ts") => fileFailures(rel, src);
    const cases = [
      ["the register tick passes", ok("`UPDATE accounting.journal_entry_postings\n SET register_cleared = $3::boolean,\n register_cleared_at = CASE WHEN $3 THEN now() ELSE NULL END\n WHERE id = $1`").length === 0],
      ["a link fill passes", ok("`UPDATE accounting.journal_entry_postings SET source_transaction_type = 'bill', source_transaction_id = $1 WHERE id = $2`").length === 0],
      ["an aliased idempotency clear passes", ok("`UPDATE accounting.journal_entry_postings jep SET idempotency_key = NULL, updated_at = now() FROM x WHERE jep.id = x.id`").length === 0],
      ["moving the account fails", ok("`UPDATE accounting.journal_entry_postings SET account_id = $2 WHERE id = $1`").some((x) => x.startsWith("RULE 1"))],
      ["moving the amount behind a bookkeeping column fails", ok("`UPDATE accounting.journal_entry_postings SET updated_at = now(), amount_cents = $2 WHERE id = $1`").some((x) => x.includes("amount_cents"))],
      ["an aliased class move fails", ok("`UPDATE accounting.journal_entry_postings p SET p.class_id = $2 WHERE p.id = $1`").some((x) => x.includes("class_id"))],
      ["the reclassify engine updating a posting fails", ok("`UPDATE accounting.journal_entry_postings SET description = $1 WHERE id = $2`", "apps/backend/src/accounting/reclassify/reclassify.service.ts").some((x) => x.startsWith("RULE 2"))],
      ["live clean passes", liveFailures({ applied: true, trigger: { enabled: "O", before_update: true }, refusesAccount: true, refusesAmount: true }).length === 0],
      ["a missing trigger fails", liveFailures({ applied: true, trigger: null }).some((x) => x.startsWith("RULE 3"))],
      ["a disabled trigger fails", liveFailures({ applied: true, trigger: { enabled: "D", before_update: true }, refusesAccount: true, refusesAmount: true }).some((x) => x.includes("DISABLED"))],
      ["a hollowed function fails", liveFailures({ applied: true, trigger: { enabled: "O", before_update: true }, refusesAccount: false, refusesAmount: true }).some((x) => x.startsWith("RULE 3"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client);
    const all = [...sf, ...liveFailures(m)];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — no writer moves a posting in place; ${m.applied ? "trg_refuse_posting_fact_update installed, enabled, refusing account and amount" : "202615360200 not applied on this database yet — static rules only"}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
