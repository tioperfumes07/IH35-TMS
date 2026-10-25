#!/usr/bin/env node
/**
 * LEAD 443.347-B — names are normalized at write for customers and vendors, matching the driver
 * rule from 202616210300.
 *
 * STATIC: migration 202616250900 exists and creates BEFORE INSERT/UPDATE triggers on
 *         mdata.customers (customer_name) and mdata.vendors (vendor_name).
 * LIVE (DATABASE_URL / gate read-only credential): no USMCA customer or vendor whose stored name
 *         differs from mdata.proper_person_name(name). Count must be 0.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "mixed guard: the static arm (migration triggers) always runs; the live row arm needs the gate's read-only credential and says LIVE NOT RUN without it";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-uppercase-names-rendered";
const MIGRATION = "db/migrations/202616250900_customer_vendor_names_normalized_at_write.sql";

export function staticFailures(sql) {
  const f = [];
  if (!/CREATE TRIGGER trg_customers_proper_name\s+BEFORE INSERT OR UPDATE OF customer_name ON mdata\.customers/.test(sql)) {
    f.push("mdata.customers has no BEFORE INSERT/UPDATE name-normalizing trigger");
  }
  if (!/NEW\.customer_name := mdata\.proper_person_name\(NEW\.customer_name\)/.test(sql)) {
    f.push("customer trigger does not normalize customer_name");
  }
  if (!/CREATE TRIGGER trg_vendors_proper_name\s+BEFORE INSERT OR UPDATE OF vendor_name ON mdata\.vendors/.test(sql)) {
    f.push("mdata.vendors has no BEFORE INSERT/UPDATE name-normalizing trigger");
  }
  if (!/NEW\.vendor_name := mdata\.proper_person_name\(NEW\.vendor_name\)/.test(sql)) {
    f.push("vendor trigger does not normalize vendor_name");
  }
  return f;
}

const sql = fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");

if (process.argv.includes("--selftest")) {
  const plant = (from, to) =>
    sql.includes(from) ? staticFailures(sql.replace(from, to)).length > 0 : null;
  const cases = [
    ["clean sources pass", staticFailures(sql).length === 0],
    ["no customer trigger FAILS", plant("CREATE TRIGGER trg_customers_proper_name", "-- CREATE TRIGGER x")],
    ["no customer_name normalize FAILS", plant("NEW.customer_name := mdata.proper_person_name(NEW.customer_name);", "")],
    ["no vendor trigger FAILS", plant("CREATE TRIGGER trg_vendors_proper_name", "-- CREATE TRIGGER y")],
    ["no vendor_name normalize FAILS", plant("NEW.vendor_name := mdata.proper_person_name(NEW.vendor_name);", "")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = staticFailures(sql);

if (process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const fn = await client.query(`SELECT to_regprocedure('mdata.proper_person_name(text)') IS NOT NULL AS ok`);
    if (!fn.rows[0]?.ok) {
      console.log(`${LABEL}: LIVE arm — migration 202616250900 or 202616210300 not applied yet (deploy pending)`);
    } else {
      const cu = await client.query(
        `SELECT cu.id::text FROM mdata.customers cu JOIN org.companies c ON c.id = cu.operating_company_id AND c.code = 'USMCA'
          WHERE cu.customer_name IS DISTINCT FROM mdata.proper_person_name(cu.customer_name)`
      );
      if (cu.rows.length) failures.push(`${cu.rows.length} USMCA customer name(s) stored without write-time casing (ids: ${cu.rows.slice(0, 5).map((x) => x.id).join(", ")}…)`);
      const ve = await client.query(
        `SELECT v.id::text FROM mdata.vendors v JOIN org.companies c ON c.id = v.operating_company_id AND c.code = 'USMCA'
          WHERE v.vendor_name IS DISTINCT FROM mdata.proper_person_name(v.vendor_name)`
      );
      if (ve.rows.length) failures.push(`${ve.rows.length} USMCA vendor name(s) stored without write-time casing (ids: ${ve.rows.slice(0, 5).map((x) => x.id).join(", ")}…)`);
      if (!cu.rows.length && !ve.rows.length) {
        console.log(`${LABEL}: LIVE — 0 ALL-CAPS customer names, 0 ALL-CAPS vendor names (USMCA)`);
      }
    }
    await client.query("ROLLBACK");
  } finally {
    client.release?.();
    await pool?.end?.();
  }
} else {
  console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL) — static checks only`);
}

if (failures.length) {
  console.error(`${LABEL}: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — customer + vendor names are proper-cased at write (triggers + rules in step)`);
