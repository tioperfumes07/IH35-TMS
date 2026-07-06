#!/usr/bin/env node
// verify-event-log-guc-reconcile.mjs
// Static CI guard (no DB) for db/migrations/202607090000_event_log_guc_reconcile.sql. Every bug fix
// gets a guard so it can't silently regress (constitution §2/§9).
//
// The fix: events.log_event() (the single SECURITY DEFINER function every one of the 5 spine-emit
// call sites funnels through) sets the events.event_log RLS GUC (`app.current_operating_company_id`)
// from its OWN p_operating_company_id argument, immediately before the INSERT the RLS policies gate.
// This is the prerequisite that makes FORCE ROW LEVEL SECURITY on events.event_log safe (see
// docs/db-audit/P0-audit-log-rls-DESIGN.md, PR #2164, for the underlying finding).
//
// This guard finds the MOST RECENT migration (by filename ordering — 4-digit legacy then 12-digit
// timestamp form both sort correctly as strings once zero-padded the same width per this repo's
// convention) that contains `CREATE OR REPLACE FUNCTION events.log_event(` with the 13-arg signature,
// and asserts its body still contains the GUC-reconciling set_config call. If a FUTURE migration
// replaces events.log_event again and drops this line, this guard fails loudly instead of silently
// reopening the P0 exposure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-event-log-guc-reconcile";
const MIG_DIR = path.join(ROOT, "db/migrations");

const FN_HEADER = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+events\.log_event\s*\(\s*[\s\S]{0,600}?p_correlation_id\s+uuid/i;
const GUC_LINE = /set_config\(\s*'app\.current_operating_company_id'\s*,\s*v_company_id::text\s*,\s*true\s*\)/;

const files = fs
  .readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // filenames are zero-padded numeric prefixes (4-digit legacy or 12-digit timestamp) — lexical sort == chronological

const candidates = [];
for (const f of files) {
  const body = fs.readFileSync(path.join(MIG_DIR, f), "utf8");
  if (FN_HEADER.test(body)) candidates.push({ file: f, body });
}

if (candidates.length === 0) {
  console.error(`[${LABEL}] FAILED — no migration defines the 13-arg events.log_event(...) function. Expected at least 202606251300_grant_ih35_app_events_usage.sql.`);
  process.exit(1);
}

const latest = candidates[candidates.length - 1];

if (!GUC_LINE.test(latest.body)) {
  console.error(
    `[${LABEL}] FAILED — the most recent events.log_event(...) definition (${latest.file}) does NOT set ` +
      `app.current_operating_company_id from its own p_operating_company_id argument before the INSERT. ` +
      `This is the P0 prerequisite for FORCE ROW LEVEL SECURITY on events.event_log (see ` +
      `docs/db-audit/P0-audit-log-rls-DESIGN.md + db/migrations/202607090000_event_log_guc_reconcile.sql) — ` +
      `without it, 4 of 5 spine-emit callers (accounting/dispatch/banking/maintenance) would have their ` +
      `writes silently rejected the moment FORCE RLS is applied, breaking the hash chain. Restore the ` +
      `set_config('app.current_operating_company_id', v_company_id::text, true) call in the function body.`
  );
  process.exit(1);
}

console.log(`[${LABEL}] OK — ${latest.file} (latest events.log_event definition) sets the event_log RLS GUC from its own argument.`);
