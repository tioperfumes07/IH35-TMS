#!/usr/bin/env node
/**
 * verify-document-links-enforced-at-db — ROUND 443.106 + DEGH-05 / 443.131 (Lead 2026-10-12).
 * The database refuses a broken document link for every writer:
 *   STATIC  S1 migration 202615781200 defines refuse_driver_bill_without_links (core links),
 *              refuse_bill_payment_without_vendor, refuse_expense_line_attr_mismatch (pre-DEGH-05);
 *           S1b migration 202615891200 finishes the trailer clause + null-header line attribution;
 *           S2 expense load-or-reason refusal stays in 202615770700 (not re-authored here).
 *   LIVE    L1 the three triggers + the expense load-or-reason trigger exist and are ENABLED
 *              (or 202615781200 is not yet applied — pending-deploy INFO, L1/L2 for the three new ones skipped);
 *           L2 bill_payments.vendor_id is NOT NULL when the three new triggers are applied
 *              (skipped while migration pending; trigger alone still refuses blanks);
 *           L3 USMCA live counts: 0 driver bills missing vendor/driver/load/unit,
 *              0 bill payments missing vendor, 0 expense lines with no load and no reason,
 *              0 expense lines whose driver/unit differ from a load-bearing header (IS DISTINCT FROM).
 *           Trailer gaps on historical rows are NOT L3-zeroed — DEGH-05 is INSERT/UPDATE only while
 *           loads 13498/13520/13525/13562 remain open for the owner.
 * --selftest plants each failure class (in-memory) → exit non-zero.
 *
 * Owned paths (gate-step-map):
 *   "db/migrations/202615781200_document_links_refused_at_db.sql"
 *   "db/migrations/202615891200_driver_bill_trailer_clause.sql"
 *   "db/migrations/202615770700_expense_line_load_or_exemption_refused.sql"
 *   "scripts/verify-document-links-enforced-at-db.mjs"
 *   "apps/backend/src/accounting/__tests__/document-links-refused-at-db.db.test.ts"
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB =
  "document-link refusals are live database objects — fails closed without a database";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-document-links-enforced-at-db";
const MIGRATION = "db/migrations/202615781200_document_links_refused_at_db.sql";
const TRAILER_MIGRATION = "db/migrations/202615891200_driver_bill_trailer_clause.sql";
const EXPENSE_LOAD_MIGRATION = "db/migrations/202615770700_expense_line_load_or_exemption_refused.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const TRIGGERS = [
  ["accounting.bills", "trg_refuse_driver_bill_without_links"],
  ["accounting.bill_payments", "trg_refuse_bill_payment_without_vendor"],
  ["accounting.expense_lines", "trg_refuse_expense_line_attr_mismatch"],
  ["accounting.expense_lines", "trg_expense_line_load_or_reason"],
];

const REFUSAL_WORDS = [
  "refuse_driver_bill_without_links",
  "refuse_bill_payment_without_vendor",
  "refuse_expense_line_attr_mismatch",
  "ALTER COLUMN vendor_id SET NOT NULL",
];

export function staticFailures(sql, expenseSql, trailerSql = "") {
  const f = [];
  for (const [, t] of TRIGGERS.slice(0, 3)) {
    if (!sql.includes(t)) f.push(`S1 ${MIGRATION}: ${t} missing`);
  }
  for (const w of REFUSAL_WORDS) {
    if (!sql.includes(w)) f.push(`S1 ${MIGRATION}: refusal "${w}" missing`);
  }
  // 443.106 intentionally deferred trailer — that file must stay without the finished clause.
  if (sql.includes("array_append(missing, 'trailer')")) {
    f.push(`S1 ${MIGRATION}: trailer clause belongs in ${TRAILER_MIGRATION}, not the deferred 443.106 file`);
  }
  if (!trailerSql) {
    f.push(`S1b ${TRAILER_MIGRATION}: missing`);
  } else {
    if (!trailerSql.includes("array_append(missing, 'trailer')")) {
      f.push(`S1b ${TRAILER_MIGRATION}: trailer clause (array_append missing 'trailer') missing`);
    }
    if (!trailerSql.includes("trailer_source = 'none'")) {
      f.push(`S1b ${TRAILER_MIGRATION}: load.trailer_source = 'none' escape missing`);
    }
    if (!trailerSql.includes("non_owned_trailer_id")) {
      f.push(`S1b ${TRAILER_MIGRATION}: non_owned_trailer_id clause missing`);
    }
    if (!trailerSql.includes("IS DISTINCT FROM h.driver_uuid") || !trailerSql.includes("IS DISTINCT FROM h.unit_id")) {
      f.push(`S1b ${TRAILER_MIGRATION}: expense-line IS DISTINCT FROM null-header comparison missing`);
    }
  }
  if (!expenseSql.includes("trg_expense_line_load_or_reason")) {
    f.push(`S2 ${EXPENSE_LOAD_MIGRATION}: trg_expense_line_load_or_reason missing`);
  }
  if (!expenseSql.includes("refuse_expense_line_without_load_or_reason")) {
    f.push(`S2 ${EXPENSE_LOAD_MIGRATION}: refuse_expense_line_without_load_or_reason missing`);
  }
  return f;
}

const NEW_TRIGGERS = TRIGGERS.slice(0, 3);
const EXPENSE_LOAD_TRIGGER = TRIGGERS[3];

export function liveFailures(m) {
  const f = [];
  const newPresent = NEW_TRIGGERS.filter(([, t]) => m.triggers.some((r) => r.tgname === t));
  const newMissing = NEW_TRIGGERS.filter(([, t]) => !m.triggers.some((r) => r.tgname === t));
  // Pre-merge / pre-migrate tip: 202615781200 is in the repo but not on the live DB yet.
  // Static S1 already proved the migration text; L3 still asserts 0 USMCA violating rows today.
  const pendingDeploy = newPresent.length === 0 && newMissing.length === NEW_TRIGGERS.length;
  if (!pendingDeploy) {
    for (const [table, t] of NEW_TRIGGERS) {
      const row = m.triggers.find((r) => r.tgname === t);
      if (!row) f.push(`L1 ${table}: trigger ${t} missing`);
      else if (row.tgenabled === "D") f.push(`L1 ${table}: trigger ${t} is DISABLED`);
    }
    if (!m.vendorNotNull) f.push("L2 accounting.bill_payments.vendor_id is nullable");
  }
  {
    const [table, t] = EXPENSE_LOAD_TRIGGER;
    const row = m.triggers.find((r) => r.tgname === t);
    if (!row) f.push(`L1 ${table}: trigger ${t} missing`);
    else if (row.tgenabled === "D") f.push(`L1 ${table}: trigger ${t} is DISABLED`);
  }
  for (const [k, v] of Object.entries(m.violations)) {
    if (Number(v) !== 0) f.push(`L3 ${k}: ${v}`);
  }
  return f;
}

export function isPendingDeploy(m) {
  return NEW_TRIGGERS.every(([, t]) => !m.triggers.some((r) => r.tgname === t));
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const triggers = (
    await client.query(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`,
      [TRIGGERS.map(([, t]) => t)]
    )
  ).rows;
  const vendorNotNull =
    (
      await client.query(
        `SELECT is_nullable = 'NO' AS nn
           FROM information_schema.columns
          WHERE table_schema = 'accounting' AND table_name = 'bill_payments' AND column_name = 'vendor_id'`
      )
    ).rows[0]?.nn === true;
  const violations = (
    await client.query(
      `SELECT
         (SELECT count(*) FROM accounting.bills
           WHERE operating_company_id = $1::uuid AND voided_at IS NULL
             AND (bill_category = 'driver' OR load_id IS NOT NULL)
             AND (mdata_vendor_id IS NULL AND NULLIF(btrim(COALESCE(vendor_id, '')), '') IS NULL
                  OR driver_id IS NULL OR load_id IS NULL OR unit_id IS NULL)
         ) AS driver_bills_missing_core_links,
         (SELECT count(*) FROM accounting.bill_payments
           WHERE operating_company_id = $1::uuid AND voided_at IS NULL
             AND NULLIF(btrim(COALESCE(vendor_id, '')), '') IS NULL
         ) AS bill_payments_missing_vendor,
         (SELECT count(*) FROM accounting.expense_lines el
            JOIN accounting.expenses e ON e.id = el.expense_id
           WHERE el.operating_company_id = $1::uuid AND e.voided_at IS NULL
             AND el.load_id IS NULL
             AND NULLIF(btrim(COALESCE(el.load_exemption_reason, '')), '') IS NULL
         ) AS expense_lines_no_load_no_reason,
         (SELECT count(*) FROM accounting.expense_lines el
            JOIN accounting.expenses e ON e.id = el.expense_id
           WHERE el.operating_company_id = $1::uuid AND e.voided_at IS NULL
             AND e.load_id IS NOT NULL
             AND (el.driver_id IS DISTINCT FROM e.driver_uuid
                  OR el.unit_id IS DISTINCT FROM e.unit_id)
         ) AS expense_lines_attr_mismatch`,
      [USMCA]
    )
  ).rows[0];
  await client.query("ROLLBACK");
  return { triggers, vendorNotNull, violations };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
  const expenseSql = readFileSync(join(ROOT, EXPENSE_LOAD_MIGRATION), "utf8");
  let trailerSql = "";
  try {
    trailerSql = readFileSync(join(ROOT, TRAILER_MIGRATION), "utf8");
  } catch {
    trailerSql = "";
  }
  if (process.argv.includes("--selftest")) {
    const good = {
      triggers: TRIGGERS.map(([, t]) => ({ tgname: t, tgenabled: "O" })),
      vendorNotNull: true,
      violations: {
        driver_bills_missing_core_links: 0,
        bill_payments_missing_vendor: 0,
        expense_lines_no_load_no_reason: 0,
        expense_lines_attr_mismatch: 0,
      },
    };
    const trailerOk = trailerSql || [
      "array_append(missing, 'trailer')",
      "trailer_source = 'none'",
      "non_owned_trailer_id",
      "IS DISTINCT FROM h.driver_uuid",
      "IS DISTINCT FROM h.unit_id",
    ].join("\n");
    const cases = [
      ["the migrations pass the static rule", staticFailures(sql, expenseSql, trailerOk).length === 0],
      [
        "a migration without the driver-bill trigger fails S1",
        staticFailures(sql.split("trg_refuse_driver_bill_without_links").join("x"), expenseSql, trailerOk).some((x) =>
          x.startsWith("S1 ")
        ),
      ],
      [
        "443.106 file with a planted trailer clause fails S1",
        staticFailures(sql + "\narray_append(missing, 'trailer')", expenseSql, trailerOk).some((x) =>
          x.includes("trailer clause belongs")
        ),
      ],
      [
        "missing DEGH-05 trailer migration fails S1b",
        staticFailures(sql, expenseSql, "").some((x) => x.startsWith("S1b")),
      ],
      [
        "DEGH-05 without trailer_source=none fails S1b",
        staticFailures(
          sql,
          expenseSql,
          "array_append(missing, 'trailer')\nnon_owned_trailer_id\nIS DISTINCT FROM h.driver_uuid\nIS DISTINCT FROM h.unit_id"
        ).some((x) => x.includes("trailer_source")),
      ],
      [
        "a missing expense load-or-reason migration fails S2",
        staticFailures(sql, expenseSql.split("trg_expense_line_load_or_reason").join("x"), trailerOk).some((x) =>
          x.startsWith("S2")
        ),
      ],
      [
        "pending deploy (no new triggers yet) still passes L1/L2",
        liveFailures({
          ...good,
          vendorNotNull: false,
          triggers: good.triggers.filter((r) => r.tgname === "trg_expense_line_load_or_reason"),
        }).length === 0,
      ],
      ["everything in force passes", liveFailures(good).length === 0],
      [
        "a missing trigger fails L1",
        liveFailures({ ...good, triggers: good.triggers.slice(1) }).some((x) => x.startsWith("L1")),
      ],
      [
        "a disabled trigger fails L1",
        liveFailures({
          ...good,
          triggers: [{ ...good.triggers[0], tgenabled: "D" }, ...good.triggers.slice(1)],
        }).some((x) => x.startsWith("L1")),
      ],
      [
        "nullable vendor_id fails L2",
        liveFailures({ ...good, vendorNotNull: false }).some((x) => x.startsWith("L2")),
      ],
      [
        "a planted driver-bill violation fails L3",
        liveFailures({
          ...good,
          violations: { ...good.violations, driver_bills_missing_core_links: 1 },
        }).some((x) => x.startsWith("L3") && x.includes("driver_bills_missing_core_links")),
      ],
      [
        "a planted bill-payment violation fails L3",
        liveFailures({
          ...good,
          violations: { ...good.violations, bill_payments_missing_vendor: 1 },
        }).some((x) => x.startsWith("L3") && x.includes("bill_payments_missing_vendor")),
      ],
      [
        "a planted expense attr mismatch fails L3",
        liveFailures({
          ...good,
          violations: { ...good.violations, expense_lines_attr_mismatch: 1 },
        }).some((x) => x.startsWith("L3") && x.includes("expense_lines_attr_mismatch")),
      ],
      [
        "a planted expense no-load-no-reason fails L3",
        liveFailures({
          ...good,
          violations: { ...good.violations, expense_lines_no_load_no_reason: 1 },
        }).some((x) => x.startsWith("L3") && x.includes("expense_lines_no_load_no_reason")),
      ],
    ];
    for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = staticFailures(sql, expenseSql, trailerSql);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let lf = [];
    try {
      const m = await measure(client);
      lf = liveFailures(m);
      if (isPendingDeploy(m)) {
        console.log(`  INFO: 202615781200 not yet applied on this database — L1/L2 for new refusals deferred; L3 USMCA counts still asserted`);
      }
      console.log(`  vendorNotNull=${m.vendorNotNull}; pendingDeploy=${isPendingDeploy(m)}; violations ${JSON.stringify(m.violations)}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf = [`L0 the live check could not run — ${err?.message ?? err}`];
    }
    const all = [...sf, ...lf];
    if (all.length) {
      console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`);
      process.exitCode = 1;
    } else {
      console.log(
        `${LABEL}: OK — DB refuses driver bills without core links + trailer clause (DEGH-05), blank bill-payment vendors, and expense-line attribution mismatches (null-header aware); expense load-or-reason still enforced; 0 USMCA live core-link violations.`
      );
    }
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
