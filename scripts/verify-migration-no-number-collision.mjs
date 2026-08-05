#!/usr/bin/env node
/**
 * verify-migration-no-number-collision
 *
 * THE DEFECT THIS PINS (2026-07-26, real, twice in one session).
 * Migration numbers are allocated by convention — "pick a number above main's current max" — and that
 * max is read with `git log --all`. That command CANNOT see a number which exists only in the PROD
 * LEDGER. On 2026-07-26 the repo max was 202609180000 while prod had already stamped 202609220000, so:
 *
 *   - 202609160000 became TWO different migrations: `..._bank_dom_05_intercompany_transfers.sql` in
 *     the repo (merged #3608) and `..._c9_form_roundtrip_persist_columns.sql` on prod;
 *   - FLT-02 was authored at 202609190000, then 202609220000 — BOTH already stamped on prod;
 *   - FIVE migrations applied on prod existed nowhere in db/migrations/, so a fresh-DB CI run built a
 *     schema production does not have.
 *
 * Nothing in the suite compared the repo to the prod ledger, so the whole class was invisible.
 *
 * TWO LAYERS — the static one must be able to run with no database (CI runs the suite against a
 * dead-port sentinel), and the live one is the only thing that can see the ledger:
 *
 *   STATIC (always): no two files in db/migrations/ share a numeric prefix. Catches an in-repo
 *   duplicate before merge — the cheapest half, and it can never be skipped for lack of a DB.
 *
 *   LIVE (degrade-safe; skips cleanly when DATABASE_URL is absent OR unreachable):
 *     (a) every migration stamped in the ledger EXISTS in db/migrations/ — the repo must be able to
 *         rebuild prod; a ledgered file missing from the repo means it cannot;
 *     (b) no number maps to a different filename in the repo than on prod;
 *     (c) reports the true next-free number = max(repo, ledger) + 1, so the next author does not
 *         repeat the mistake this guard exists to prevent.
 *
 * Usage: node scripts/verify-migration-no-number-collision.mjs [--selftest]
 */
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const NUM_RE = /^(\d{4,14})[_-]/;

/**
 * FROZEN BASELINE — 28 numbers (57 files) that ALREADY collided when this guard was written.
 *
 * They are historical and inert: `db-migrate.mjs` keys its skip decision on FILENAME, not number, so a
 * duplicated number never caused a wrong skip. They are frozen rather than fixed because renaming an
 * APPLIED migration is forbidden (checksum freeze — the 2026-07-25 outage) and there is no safe way to
 * un-collide them after the fact.
 *
 * This is a RATCHET: a NEW collision fails the build. Removing an entry from this map means that
 * number can never collide again. NEVER add to this map to make a build green — that is the one edit
 * this guard exists to prevent.
 */
const KNOWN_COLLISIONS = new Map(Object.entries({
  "0050": [
    "0050_safety_gaps_fill.sql",
    "0050_two_section_v5_and_safety_restructure.sql"
  ],
  "0051": [
    "0051_arriving_soon_views.sql",
    "0051_p3_t11_17_2_safety_v6_4_schema.sql"
  ],
  "0146": [
    "0146_p6_t11182_qbo_write_back_mirror.sql",
    "0146_work_order_qbo_vendor_linkage.sql"
  ],
  "0167": [
    "0167_block_i_settlement_preview_costs.sql",
    "0167_p7_block_e_notif_prefs.sql"
  ],
  "0195": [
    "0195_accounting_posting_backbone_schema.sql",
    "0195_qbo_vendor_customer_nonpartial_unique.sql"
  ],
  "0217": [
    "0217_accounting_period_cash_basis_snapshot.sql",
    "0217_qbo_invoices_mirror_table.sql"
  ],
  "0218": [
    "0218_accounting_expense_category_account_map.sql",
    "0218_period_cash_basis_snapshot_lock_trigger.sql",
    "0218_qbo_bills_mirror_table.sql"
  ],
  "0219": [
    "0219_block_29_bank_reconciliation_matches.sql",
    "0219_cap11_hos_duty_status_events.sql"
  ],
  "0220": [
    "0220_block_32_bill_lines_account_id_resolution.sql",
    "0220_cap13_geofencing.sql"
  ],
  "0221": [
    "0221_block_33_invoice_line_revenue_mapping.sql",
    "0221_cap9_vehicle_driver_assignments.sql"
  ],
  "0222": [
    "0222_block_34_payment_application_engine.sql",
    "0222_cap3_stop_arrivals.sql"
  ],
  "0223": [
    "0223_block_35_chart_of_accounts_roles.sql",
    "0223_cap7_maintenance_pm_alerts.sql"
  ],
  "0224": [
    "0224_block_26_factor_reconciliation.sql",
    "0224_cap2_auto_geofence_source.sql"
  ],
  "0233": [
    "0233_block_22_driver_settlement_engine.sql",
    "0233_cap1_vehicle_locations.sql"
  ],
  "0234": [
    "0234_block_23_escrow_posting_flow.sql",
    "0234_cap_fuel_gps_matches.sql"
  ],
  "0340": [
    "0340_reference_driver_catalogs.sql",
    "0340_reference_driver_lookups.sql"
  ],
  "0363": [
    "0363_identity_driver_applicants.sql",
    "0363_maint_tire_program.sql"
  ],
  "202606071500": [
    "202606071500_edi_foundation.sql",
    "202606071500_geofence_state_transitions.sql"
  ],
  "202606071800": [
    "202606071800_fuel_fraud_alerts.sql",
    "202606071800_insurance_bill_schedule_link.sql"
  ],
  "202606080112": [
    "202606080112_border_crossing_events_rls.sql",
    "202606080112_geofence_integrity_findings.sql"
  ],
  "202606080205": [
    "202606080205_ifta_filings.sql",
    "202606080205_load_test_runs.sql"
  ],
  "202607051000": [
    "202607051000_qbo_connections_reauth_observability.sql",
    "202607051000_woid1_next_wo_display_id_unit_company.sql"
  ],
  "202607051200": [
    "202607051200_g10m_row_changes_evidence_table_triggers.sql",
    "202607051200_g6_4_bills_amount_cents_canonical.sql"
  ],
  "202607052300": [
    "202607052300_driver_advance_account_link.sql",
    "202607052300_per_entity_posting_flag_golive.sql"
  ],
  "202607860000": [
    "202607860000_fleet_catalogs_per_entity.sql",
    "202607860000_qbo_ap_bill_payments_inbound_mirror.sql"
  ],
  "202607890000": [
    "202607890000_driver_termination_reasons_per_entity.sql",
    "202607890000_qbo_expenses_projection_key_and_flags.sql"
  ],
  "202607920000": [
    "202607920000_customer_quality_reasons_per_entity.sql",
    "202607920000_qbo_ar_payments_inbound_mirror.sql"
  ],
  "202607950000": [
    "202607950000_catalogs_items_backfill_from_qbo_mirror.sql",
    "202607950000_posting_batches_template_link.sql"
  ]
}));

/** PURE: group migration filenames by numeric prefix; any group > 1 is a collision. */
export function findRepoCollisions(filenames) {
  const byNumber = new Map();
  for (const f of filenames) {
    const m = NUM_RE.exec(f);
    if (!m) continue;
    if (!byNumber.has(m[1])) byNumber.set(m[1], []);
    byNumber.get(m[1]).push(f);
  }
  const out = [];
  for (const [number, files] of byNumber) {
    if (files.length < 2) continue;
    const known = KNOWN_COLLISIONS.get(number);
    // Frozen only if it is the SAME collision — a third file on a known-colliding number is NEW.
    if (known && [...files].sort().join("|") === [...known].sort().join("|")) continue;
    out.push(`number ${number} is used by ${files.length} migrations: ${files.join(" AND ")}`);
  }
  return out;
}

function repoMigrations() {
  const dir = resolve(process.cwd(), MIGRATIONS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".sql"));
}

async function liveCheck(repoFiles) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("  live: SKIP — no DATABASE_URL (degrade-safe)");
    return [];
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (err) {
    // verify:static runs the suite against a dead-port sentinel so nothing can reach a real DB.
    console.log(`  live: SKIP — DATABASE_URL set but unreachable (${err.code ?? err.message})`);
    return [];
  }
  try {
    const led = await client.query(`SELECT filename FROM _system._schema_migrations`);
    if (!led.rows.length) {
      return ["ledger read returned 0 rows — treat as a FALSE EMPTY, not a pass; re-run with a real connection"];
    }
    const problems = [];
    const repoByNumber = new Map();
    for (const f of repoFiles) {
      const m = NUM_RE.exec(f);
      if (m) {
        if (!repoByNumber.has(m[1])) repoByNumber.set(m[1], new Set());
        repoByNumber.get(m[1]).add(f);
      }
    }

    const ledgerByNumber = new Map();
    for (const { filename } of led.rows) {
      const m = NUM_RE.exec(filename);
      if (!m) continue;
      if (!ledgerByNumber.has(m[1])) ledgerByNumber.set(m[1], new Set());
      ledgerByNumber.get(m[1]).add(filename);
    }

    const allNumbers = new Set([...repoByNumber.keys(), ...ledgerByNumber.keys()]);
    for (const number of allNumbers) {
      const repoSet = repoByNumber.get(number) ?? new Set();
      const ledgerSet = ledgerByNumber.get(number) ?? new Set();
      const known = KNOWN_COLLISIONS.get(number);

      if (known) {
        const knownSet = new Set(known);
        const extraLedger = [...ledgerSet].filter((f) => !knownSet.has(f));
        if (extraLedger.length) {
          problems.push(
            `number ${number} has ledger file(s) outside the frozen baseline: ${extraLedger.join(", ")}`
          );
        }
        // The repo side is already ratcheted by findRepoCollisions. A ledger subset of the frozen
        // set is the expected historical residue — do not treat it as a new collision.
        continue;
      }

      if (repoSet.size > 1) {
        problems.push(
          `number ${number} is used by ${repoSet.size} migrations in ${MIGRATIONS_DIR}: ${[...repoSet].join(" AND ")}`
        );
      }
      if (ledgerSet.size > 1) {
        problems.push(
          `number ${number} is stamped ${ledgerSet.size} times on prod: ${[...ledgerSet].join(" AND ")}`
        );
      }
      const repoFile = [...repoSet][0];
      const ledgerFile = [...ledgerSet][0];
      if (repoFile && ledgerFile && repoFile !== ledgerFile) {
        problems.push(
          `number ${number} is '${repoFile}' in the repo but '${ledgerFile}' on prod — the same number is two different migrations`
        );
      }
    }

    const missing = [];
    for (const { filename } of led.rows) {
      const m = NUM_RE.exec(filename);
      if (!m) continue;
      if (!repoFiles.includes(filename)) {
        const known = KNOWN_COLLISIONS.get(m[1]);
        if (!known || !known.includes(filename)) {
          missing.push(filename);
        }
      }
    }
    if (missing.length) {
      problems.push(
        `${missing.length} migration(s) are stamped in the prod ledger but ABSENT from ${MIGRATIONS_DIR} — the repo can no longer rebuild prod: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}`
      );
    }

    const maxLedger = led.rows.map((r) => NUM_RE.exec(r.filename)?.[1]).filter(Boolean).sort().at(-1) ?? "0";
    const maxRepo = [...repoByNumber.keys()].sort().at(-1) ?? "0";
    console.log(`  live: ledger rows=${led.rows.length} maxLedger=${maxLedger} maxRepo=${maxRepo}`);
    console.log(`  live: NEXT FREE NUMBER must be above ${maxLedger > maxRepo ? maxLedger : maxRepo} (the ledger is authoritative, not git log)`);
    return problems;
  } finally {
    await client.end();
  }
}

function selftest() {
  let ok = true;
  const real = repoMigrations();

  if (findRepoCollisions(real).length) {
    console.error("SELFTEST FAIL: the real db/migrations/ tree has a collision OUTSIDE the frozen baseline — fix the collision, never widen the baseline");
    ok = false;
  } else {
    console.log(`SELFTEST: real tree clean against the frozen baseline (${KNOWN_COLLISIONS.size} historical collisions) — OK`);
  }

  // The ratchet itself must be provable: a NEW file on a KNOWN-colliding number must still fail.
  const known0 = [...KNOWN_COLLISIONS.entries()][0];
  if (known0) {
    const [num, files] = known0;
    if (!findRepoCollisions([...files, `${num}_a_brand_new_third_file.sql`]).length) {
      console.error("SELFTEST FAIL: a NEW file added to a frozen collision was NOT caught — the baseline is a hole, not a ratchet");
      ok = false;
    } else {
      console.log("SELFTEST: a new file on a frozen number is still caught (baseline is a ratchet, not an allowlist)");
    }
  }

  const cases = [
    ["duplicate number", ["202609160000_a.sql", "202609160000_b.sql"], true],
    ["distinct numbers", ["202609160000_a.sql", "202609170000_b.sql"], false],
    ["three-way collision", ["0001_a.sql", "0001_b.sql", "0001_c.sql"], true],
    ["non-numeric ignored", ["README.sql", "notes.sql"], false],
  ];
  for (const [name, files, shouldFlag] of cases) {
    const flagged = findRepoCollisions(files).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = repoMigrations();
  const problems = [...findRepoCollisions(files), ...(await liveCheck(files))];
  if (problems.length) {
    console.error(`[verify-migration-no-number-collision] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`[verify-migration-no-number-collision] OK — ${files.length} migrations; no NEW number collision (${KNOWN_COLLISIONS.size} historical ones frozen)`);
}
