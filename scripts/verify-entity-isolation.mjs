#!/usr/bin/env node
/**
 * verify-entity-isolation.mjs — TOTAL ENTITY ISOLATION guard (Jorge, 2026-07-05, verbatim intent):
 * "each company should be completely independent ... each company should never touch anything of
 * another." TRANSP / TRK / USMCA share one Neon Postgres DB via RLS walls (not separate physical DBs
 * — rejected as too costly). This guard is the PERMANENT enforcement of that wall: it does not fix
 * today's non-compliant tables (that is separate P1/P4/RLS-force-tail remediation work) — it (a)
 * PASSES today by capturing every known non-compliant business table in a documented, reviewed
 * backlog, and (b) FAILS the instant anyone (human or agent) introduces a NEW un-walled business
 * table, or weakens/removes compliance on an already-compliant one.
 *
 * A business table is ENTITY-SCOPED (compliant) only if it has ALL FOUR:
 *   (a) a scoping column of type uuid — canonically `operating_company_id`, but `tenant_id` and
 *       `company_id` are ALSO accepted: both are verified-live, systematically-used synonyms for the
 *       exact same per-entity scoping contract (see docs/ci-guards/ENTITY-ISOLATION.md — e.g. every
 *       insurance.* and factoring.* table, plus several accounting/mdata/maint tables, scope by
 *       `tenant_id` not `operating_company_id`, and onboarding.onboarding_state scopes by
 *       `company_id`). A column present but NOT uuid (e.g. text) fails this requirement — needs a
 *       uuid-cast migration.
 *   (b) a foreign key FROM that exact column TO org.companies(id).
 *   (c) at least one RLS policy (qual or with-check) whose expression contains the scoping column AND
 *       scopes it by one of TWO doc-sanctioned forms:
 *         Form 1 (single-active-entity equality): <col> = current_setting('app.operating_company_id',
 *           ...) — or the documented app.current_operating_company_id GUC variant (the events.event_log
 *           exception, see docs/ci-guards/ENTITY-ISOLATION.md landmine notes).
 *         Form 2 (accessible-companies membership): <col> IN (SELECT org.user_accessible_company_ids())
 *           or ... IN (SELECT company_id FROM org.user_company_access WHERE user_id = ...). NOT a
 *           weaker fallback — docs/specs/MULTI-ENTITY-SEPARATION.md section 8 (LAW) explicitly
 *           prescribes this exact shape for role-elevated visibility: "role elevation widens
 *           visibility WITHIN accessible companies only, never across entities." A manager granted
 *           access to more than one company is INTENDED to see all of them in one query — every
 *           mdata.customers/drivers/vendors/loads-class table uses this form.
 *       A policy with NEITHER form (bare role check via identity.current_user_role(), or unconditional
 *       true) does NOT count — that is the real "zero-isolation policy" failure mode from the
 *       rls-unforced-tail-resolution audit.
 *   (d) pg_class.relforcerowsecurity = true (FORCE ROW LEVEL SECURITY — RLS enabled-but-not-forced
 *       lets the table owner bypass every policy above).
 *
 * GLOBAL (exempt from all four) is a small, hand-curated, human-reviewed allowlist for genuinely
 * non-entity structural tables (reference/lookup, migration ledgers, the org/identity control plane
 * itself). GLOBAL is never touched by --update — only a human editing
 * scripts/entity-isolation-allowlist.json directly can add/remove a global entry, and that diff must
 * be reviewed like any other schema-classification change.
 *
 * REMEDIATION_BACKLOG is the burn-down debt list — every currently-non-compliant business table that
 * is NOT global. --update regenerates this array from live introspection (recomputing reasons); it is
 * NEVER silently grown by a normal feature PR — regenerating it is itself a reviewable diff (same
 * house convention as verify-schema-parity.mjs --update / verify-phantom-relations.mjs).
 *
 * Usage:
 *   node scripts/verify-entity-isolation.mjs           # CI gate — exit 1 on a NEW leak or stale entry
 *   node scripts/verify-entity-isolation.mjs --update  # regenerate remediation_backlog (global untouched)
 *
 * Requires DATABASE_DIRECT_URL or DATABASE_URL pointed at a FRESH-MIGRATED database (see
 * docs/ci-guards/ENTITY-ISOLATION.md — same fresh-DB-CI-only convention as every other DB-driven guard
 * in this repo). Connects, `SET ROLE ih35_app` (matches scripts/verify-rls-operating-company-scope.mjs
 * and scripts/db-verify-mdata-rls.mjs), and only reads pg_catalog — makes no schema/data change.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_PATH = path.join(ROOT, "scripts/entity-isolation-allowlist.json");
const UPDATE = process.argv.includes("--update");

const EXCLUDED_SCHEMAS = ["pg_catalog", "information_schema", "pg_temp", "ih35_migrations", "topology"];

// Verified-live synonyms for the per-entity scoping column. operating_company_id is canonical;
// tenant_id and company_id are real, systematically-used equivalents in this schema (not a guess —
// checked against every occurrence in the fresh-migrated DB before being added here). Order = search
// preference when a table happens to carry more than one.
const SCOPE_COLUMNS = ["operating_company_id", "tenant_id", "company_id"];

// Accepted GUC names for the current_setting(...) comparison inside a qualifying RLS policy.
// app.operating_company_id is standard; app.current_operating_company_id is the documented
// events.event_log exception (see docs/ci-guards/ENTITY-ISOLATION.md).
const ACCEPTED_GUCS = ["app.operating_company_id", "app.current_operating_company_id"];

function fail(msg) {
  console.error(`verify:entity-isolation FAIL: ${msg}`);
  process.exit(1);
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    fail(`missing allowlist: ${path.relative(ROOT, ALLOWLIST_PATH)}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch (err) {
    fail(`allowlist JSON is not valid JSON: ${String(err?.message || err)}`);
  }
  if (!Array.isArray(raw.global) || !Array.isArray(raw.remediation_backlog)) {
    fail("allowlist JSON must have top-level 'global' and 'remediation_backlog' arrays");
  }
  for (const row of raw.global) {
    if (!row.schema || !row.table || !row.reason) {
      fail(`global entry missing schema/table/reason: ${JSON.stringify(row)}`);
    }
  }
  for (const row of raw.remediation_backlog) {
    if (!row.schema || !row.table || !row.reason || !row.phase) {
      fail(`remediation_backlog entry missing schema/table/reason/phase: ${JSON.stringify(row)}`);
    }
  }
  return raw;
}

const key = (row) => `${row.schema}.${row.table}`;

async function introspect(client) {
  const res = await client.query(
    `
    WITH tabs AS (
      SELECT c.oid, n.nspname AS schema_name, c.relname AS table_name,
             c.relforcerowsecurity AS forced, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND NOT (n.nspname = ANY($1::text[]))
    ),
    cols AS (
      SELECT a.attrelid, a.attname::text AS attname, format_type(a.atttypid, a.atttypmod) AS coltype
      FROM pg_attribute a
      WHERE a.attname = ANY($2::text[]) AND NOT a.attisdropped
    ),
    fks AS (
      -- attname::text is required: pg_attribute.attname is type "name", so a bare array_agg(attname)
      -- produces name[] (OID 1003), which node-pg's default array parser does not recognize and
      -- returns as an unparsed "{...}" string instead of a JS array. Cast to text first.
      SELECT con.conrelid, a.attname::text AS col
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid = 'org.companies'::regclass
        AND a.attname = ANY($2::text[])
    ),
    pol AS (
      SELECT polrelid,
        string_agg(
          coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), ''),
          ' | '
        ) AS exprs,
        count(*) AS policy_count
      FROM pg_policy
      GROUP BY polrelid
    )
    SELECT
      t.schema_name,
      t.table_name,
      t.rls_enabled,
      t.forced,
      COALESCE(
        (SELECT json_agg(json_build_object('col', c.attname, 'type', c.coltype)) FROM cols c WHERE c.attrelid = t.oid),
        '[]'
      ) AS scope_cols,
      COALESCE((SELECT array_agg(DISTINCT f.col) FROM fks f WHERE f.conrelid = t.oid), ARRAY[]::text[]) AS fk_cols,
      COALESCE(p.exprs, '') AS policy_exprs,
      COALESCE(p.policy_count, 0)::int AS policy_count
    FROM tabs t
    LEFT JOIN pol p ON p.polrelid = t.oid
    ORDER BY 1, 2;
    `,
    [EXCLUDED_SCHEMAS, SCOPE_COLUMNS]
  );
  return res.rows;
}

/**
 * Classify one table. Returns { compliant, chosenCol, missing: string[] } where `missing` lists
 * every failing requirement (a)-(d), specific to this table's current state.
 */
function classify(row) {
  const scopeCols = row.scope_cols; // [{col, type}]
  const byName = new Map(scopeCols.map((c) => [c.col, c.type]));
  const fkCols = new Set(row.fk_cols || []);

  const gucAlt = ACCEPTED_GUCS.map((g) => g.replace(".", "\\.")).join("|");

  function policyScopesColumn(col) {
    if (!row.policy_exprs) return false;
    const hasCol = new RegExp(`\\b${col}\\b`).test(row.policy_exprs);
    if (!hasCol) return false;
    // Form 1 (single-active-entity equality): <col> = current_setting('app.operating_company_id', ...)
    // (or the documented app.current_operating_company_id GUC variant, or a ::text cast on either side).
    const hasGuc = new RegExp(`current_setting\\(\\s*'(${gucAlt})'`).test(row.policy_exprs);
    // Form 2 (accessible-companies membership — MULTI-ENTITY-SEPARATION.md §8, LAW, explicitly
    // prescribes this as the correct model for role-elevated visibility: "Policies key on
    // operating_company_id / owner_company_id / currently_leased_to_company_id ∈
    // org.user_accessible_company_ids() ... role elevation widens visibility WITHIN accessible
    // companies only, never across entities." A manager legitimately granted access to more than one
    // company (via org.user_company_access) is INTENDED to see all of them in one query — that is not
    // a cross-entity leak, it is the documented access-list model. Only a policy with NEITHER form is
    // a real gap (bare role check, or unconditional true).
    const hasMembership = /user_accessible_company_ids\s*\(\s*\)|FROM\s+org\.user_company_access/.test(
      row.policy_exprs
    );
    return hasGuc || hasMembership;
  }

  // Try each candidate scope column in preference order; a table is compliant if ANY one of them
  // fully satisfies (a)-(d). If none fully qualifies, report the missing pieces for the first
  // candidate that is actually PRESENT on the table (most informative), or a generic "no scoping
  // column at all" if none of the candidates exist.
  const present = SCOPE_COLUMNS.filter((c) => byName.has(c));

  for (const col of present) {
    const type = byName.get(col);
    const isUuid = type === "uuid";
    const hasFk = fkCols.has(col);
    const hasPolicy = policyScopesColumn(col);
    const forced = row.forced === true;
    if (isUuid && hasFk && hasPolicy && forced) {
      return { compliant: true, chosenCol: col, missing: [] };
    }
  }

  if (present.length === 0) {
    return {
      compliant: false,
      chosenCol: null,
      missing: [`no scoping column present (checked: ${SCOPE_COLUMNS.join(", ")})`],
    };
  }

  // Report against the first present candidate (most likely the intended one).
  const col = present[0];
  const type = byName.get(col);
  const missing = [];
  if (type !== "uuid") {
    missing.push(`needs uuid cast (column '${col}' is currently '${type}')`);
  }
  if (!fkCols.has(col)) {
    missing.push(`needs FK from '${col}' to org.companies(id)`);
  }
  if (!policyScopesColumn(col)) {
    missing.push(
      row.policy_count > 0
        ? `needs opco-scoped RLS policy (currently: ${row.policy_count} polic${row.policy_count === 1 ? "y" : "ies"}, none scope '${col}' against current_setting('app.operating_company_id'|'app.current_operating_company_id') OR org.user_accessible_company_ids()/org.user_company_access membership)`
        : `needs opco-scoped RLS policy (currently: no policies at all)`
    );
  }
  if (!row.forced) {
    missing.push(`needs FORCE ROW LEVEL SECURITY (rls_enabled=${row.rls_enabled}, forced=false)`);
  }
  return { compliant: false, chosenCol: col, missing };
}

// Hardcoded context appended to auto-generated reasons for specific documented landmines (see
// docs/ci-guards/ENTITY-ISOLATION.md). This is NOT a way to silently exempt a table — these tables
// still land in remediation_backlog like any other non-compliant table; this only makes their *reason*
// specific instead of generic, per the requirement that every backlog reason names what's actually
// missing for THAT table.
const LANDMINE_NOTES = new Map([
  [
    "mdata.units",
    "ARCHITECTURE DECISION NEEDED (not a raw add-column fix): mdata.units deliberately has NO " +
      "operating_company_id — it carries owner_company_id (TRK owns) + currently_leased_to_company_id " +
      "(TRANSP/USMCA lease); a unit can be TRK-owned but TRANSP-leased. Walling it the standard single-" +
      "column way would be WRONG. Needs an explicit owner/lease dual-scope RLS design before it can be " +
      "marked compliant.",
  ],
  [
    "mdata.equipment",
    "Same dual-column ownership model as mdata.units (owner_company_id + currently_leased_to_company_id, " +
      "no single operating_company_id). ARCHITECTURE DECISION NEEDED before standard single-column walling " +
      "applies.",
  ],
  [
    "accounting.fixed_assets",
    "Same owner/lessor dual-ownership shape as mdata.units/equipment (owner_operating_company_id / " +
      "lessor_operating_company_id-style columns), not a single operating_company_id. Needs the same " +
      "architecture decision as the units/equipment precedent before standard walling applies.",
  ],
  [
    "fixed_assets.assets",
    "Same owner/lessor dual-ownership shape as mdata.units/equipment. Needs the same architecture " +
      "decision as the units/equipment precedent before standard walling applies.",
  ],
  [
    "accounting.lease_contract",
    "Carries lessor_operating_company_id (the asset owner side of a lease) rather than a single " +
      "operating_company_id — a lease inherently spans two entities (lessor + lessee). Needs an explicit " +
      "two-sided-lease RLS design, same class of decision as the units/equipment owner/lease model.",
  ],
  [
    "events.event_log",
    "GUC NAME IS NOT THE GAP (already reconciled): migration 202607090000 fixed events.log_event() to " +
      "derive app.current_operating_company_id from its own p_operating_company_id argument, so every " +
      "caller is correct by construction. What remains: (b) operating_company_id has NO foreign key to " +
      "org.companies, and (d) RLS is enabled but NOT FORCED — migration " +
      "202607080100_event_log_force_rls_blocked_pending_guc_fix.sql is the tracked no-op placeholder " +
      "documenting that FORCE is a deliberate separate follow-up (P0-a), to be authored only after a " +
      "Neon-branch re-verification that forcing does not reject any spine-emit writer. Do not force this " +
      "table as a side effect of closing this backlog entry.",
  ],
  [
    "catalogs.account_role_bindings",
    "PARTIALLY MIGRATED, not un-migrated: migration 202607010700_account_role_bindings_per_entity.sql " +
      "added a NULLABLE operating_company_id + a resolver-side entity guard, but a GLOBAL role_key UNIQUE " +
      "constraint still exists, which blocks true per-entity rows (two entities can't both have a " +
      "'default_ar_control' binding). Current policies are role-only (no operating_company_id comparison) " +
      "— pending the unique-constraint drop before real per-entity RLS can be written.",
  ],
]);

function buildReason(t, classification) {
  const k = `${t.schema_name}.${t.table_name}`;
  const base = classification.missing.join(" | ");
  const note = LANDMINE_NOTES.get(k);
  return note ? `${base} — ${note}` : base;
}

function derivePhase(t, classification) {
  const k = `${t.schema_name}.${t.table_name}`;
  if (LANDMINE_NOTES.has(k)) return "other";
  const missing = classification.missing;
  const onlyForce = missing.length === 1 && /FORCE ROW LEVEL SECURITY/.test(missing[0]);
  if (onlyForce) return "RLS-force-tail";
  const noColumnAtAll = missing.length === 1 && /no scoping column present/.test(missing[0]);
  if (noColumnAtAll) return "P1";
  return "P4";
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    fail(
      "DATABASE_DIRECT_URL or DATABASE_URL is required — this guard reads live pg_catalog on a " +
        "fresh-migrated DB (see docs/ci-guards/ENTITY-ISOLATION.md). Never point it at prod."
    );
  }

  const allowlist = loadAllowlist();
  const globalSet = new Set(allowlist.global.map(key));
  const backlogMap = new Map(allowlist.remediation_backlog.map((r) => [key(r), r]));

  const { Pool } = pg;
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  let rows;
  try {
    await client.query("SET ROLE ih35_app");
    rows = await introspect(client);
  } finally {
    client.release();
    await pool.end();
  }

  const businessRows = rows.filter((r) => !globalSet.has(`${r.schema_name}.${r.table_name}`));

  if (UPDATE) {
    const newBacklog = [];
    for (const t of businessRows) {
      const classification = classify(t);
      if (classification.compliant) continue;
      newBacklog.push({
        schema: t.schema_name,
        table: t.table_name,
        reason: buildReason(t, classification),
        phase: derivePhase(t, classification),
      });
    }
    newBacklog.sort((a, b) => key(a).localeCompare(key(b)));

    const before = new Set(allowlist.remediation_backlog.map(key));
    const after = new Set(newBacklog.map(key));
    const added = [...after].filter((k) => !before.has(k));
    const removed = [...before].filter((k) => !after.has(k));

    const updated = { global: allowlist.global, remediation_backlog: newBacklog };
    fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(updated, null, 2) + "\n");

    console.log(`[entity-isolation --update] regenerated remediation_backlog from live introspection.`);
    console.log(`[entity-isolation --update] 'global' array left UNTOUCHED (${allowlist.global.length} entries) — hand-curated, never auto-touched.`);
    console.log(`[entity-isolation --update] remediation_backlog: ${before.size} -> ${newBacklog.length}`);
    if (added.length) {
      console.log(`[entity-isolation --update] NEWLY BACKLOGGED (${added.length}) — review this diff like any CI baseline update:`);
      for (const k of added) console.log(`    + ${k}`);
    }
    if (removed.length) {
      console.log(`[entity-isolation --update] REMOVED, now compliant (${removed.length}):`);
      for (const k of removed) console.log(`    - ${k}`);
    }
    console.log("[entity-isolation --update] This regenerated file is a reviewable diff, not a silent baseline bump — a human must inspect it before merge (same convention as verify:schema-parity:update / verify:phantom-relations).");
    console.log(`remediation_backlog_count=${newBacklog.length}`);
    return;
  }

  const newViolations = [];
  const staleEntries = [];
  for (const t of businessRows) {
    const k = `${t.schema_name}.${t.table_name}`;
    const classification = classify(t);
    if (classification.compliant) {
      if (backlogMap.has(k)) {
        staleEntries.push(k);
      }
    } else if (!backlogMap.has(k)) {
      newViolations.push(`${k}: ${classification.missing.join(" | ")}`);
    }
  }

  if (newViolations.length > 0) {
    console.error("\nENTITY-ISOLATION GUARD FAILED — new un-walled business table(s) introduced:");
    console.error("=".repeat(72));
    for (const v of newViolations) console.error(`  ${v}`);
    console.error("=".repeat(72));
    console.error(
      "Every business table must be entity-scoped (operating_company_id/tenant_id/company_id uuid + " +
        "FK to org.companies + opco-scoped FORCE RLS policy), OR be in scripts/entity-isolation-allowlist.json " +
        "under 'global' (hand-reviewed, genuinely non-entity) or 'remediation_backlog' (tracked debt). " +
        "See docs/ci-guards/ENTITY-ISOLATION.md."
    );
    console.log(`new_violations=${newViolations.length}`);
    process.exit(1);
  }

  if (staleEntries.length > 0) {
    console.error("\nENTITY-ISOLATION GUARD FAILED — stale remediation_backlog entries (now compliant, not removed):");
    console.error("=".repeat(72));
    for (const s of staleEntries) console.error(`  ${s} — now compliant, remove from backlog via: npm run verify:entity-isolation:update`);
    console.error("=".repeat(72));
    console.log(`new_violations=0`);
    process.exit(1);
  }

  console.log(
    `verify:entity-isolation PASS (${rows.length} tables scanned, ${allowlist.global.length} global-exempt, ` +
      `${allowlist.remediation_backlog.length} in remediation_backlog, 0 new leaks, 0 stale entries)`
  );
  console.log(`remediation_backlog_count=${allowlist.remediation_backlog.length}`);
  console.log(`new_violations=0`);
}

main().catch((err) => fail(String(err?.stack || err?.message || err)));
