#!/usr/bin/env npx tsx
/**
 * ROUND 213 arm 31 — void Check Creator test expenses left in USMCA.
 *
 * Owner (ROUND 213): "Test records must never be written into USMCA." Lead routed
 * these four expense ids to Cursor. Three $1.00 Check Creator proof rows are already
 * voided (AUTH-117/120/122). The remaining live row is the $25.00 Smithfield draft-
 * but-posted check (trace 2099). Void via voidCheck() — existing app path, WORM,
 * reversing JE. No Neon INSERT. No DELETE.
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-124 DATABASE_URL=<prod> npx tsx scripts/ops/r213-arm31-void-check-creator-tests.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { voidCheck } from "../../apps/backend/src/accounting/checks/check-void.service.js";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "86e1e31f-c7b6-4427-bca6-40c5c4cff6d8";
const AUTH_ID = "AUTH-124";

const TARGETS = [
  { id: "a7671a67-6b8a-4282-901a-2fd6dd7991ca", cents: 100, label: "$1.00 AUTH-120 #1002" },
  { id: "9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9", cents: 100, label: "$1.00 AUTH-117 #1001" },
  { id: "7728cf89-6ca2-4819-b610-7a013e4dbd61", cents: 100, label: "$1.00 AUTH-122 #1003" },
  { id: "f9c5b0e4-644c-4b03-b7c2-424d540ea65f", cents: 2500, label: "$25.00 Smithfield trace 2099" },
] as const;

{
  const authId = process.env.OWNER_AUTH_ID;
  if (authId !== AUTH_ID) {
    console.error(`Refusing: set OWNER_AUTH_ID=${AUTH_ID} (got ${JSON.stringify(authId ?? null)})`);
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], {
    stdio: "inherit",
  });
}

if (!process.env.DATABASE_URL) {
  console.error("Refusing: DATABASE_URL required");
  process.exit(1);
}

type Row = {
  id: string;
  status: string;
  voided_at: string | null;
  total_amount_cents: string;
  check_number: string | null;
  memo: string | null;
  posting_status: string | null;
  reversed_by_je_id: string | null;
  journal_entry_id: string | null;
  load_id: string | null;
  driver_uuid: string | null;
  unit_id: string | null;
};

async function loadRows(): Promise<Row[]> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const ids = TARGETS.map((t) => t.id);
    const res = await client.query<Row>(
      `SELECT id::text, status, voided_at::text, total_amount_cents::text, check_number, memo,
              posting_status, reversed_by_je_id::text, journal_entry_id::text,
              load_id::text, driver_uuid::text, unit_id::text
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[])
        ORDER BY total_amount_cents, created_at`,
      [USMCA, ids]
    );
    return res.rows;
  });
}

function printRows(label: string, rows: Row[]) {
  console.log(label);
  for (const t of TARGETS) {
    const r = rows.find((x) => x.id === t.id);
    if (!r) {
      console.log(`  MISSING ${t.id} ${t.label}`);
      continue;
    }
    console.log(
      `  ${r.id} cents=${r.total_amount_cents} status=${r.status} voided_at=${r.voided_at ?? "NULL"} posting=${r.posting_status} rev_je=${r.reversed_by_je_id ?? "NULL"} check#=${r.check_number ?? "NULL"}`
    );
  }
}

async function main() {
  const before = await loadRows();
  printRows("BEFORE", before);
  if (before.length !== TARGETS.length) {
    console.error(`FAIL — expected ${TARGETS.length} rows, got ${before.length}`);
    process.exit(1);
  }

  for (const t of TARGETS) {
    const row = before.find((r) => r.id === t.id);
    if (!row) {
      console.error(`FAIL — missing ${t.id}`);
      process.exit(1);
    }
    if (Number(row.total_amount_cents) !== t.cents) {
      console.error(`FAIL — ${t.id} cents ${row.total_amount_cents} != ${t.cents}`);
      process.exit(1);
    }
    if (row.status === "void" || row.voided_at) {
      console.log(`ALREADY_VOID ${t.id} ${t.label} voided_at=${row.voided_at}`);
      continue;
    }
    console.log(`VOIDING ${t.id} ${t.label}`);
    const result = await voidCheck(
      USMCA,
      ACTOR,
      t.id,
      "ROUND 213 arm 31 — Check Creator test record void (seat fixtures never stay in USMCA)"
    );
    console.log("VOIDED", t.id, result);
  }

  const after = await loadRows();
  printRows("AFTER", after);

  const stillLive = after.filter((r) => r.status !== "void" && !r.voided_at);
  if (stillLive.length > 0) {
    console.error("FAIL — still live:", stillLive.map((r) => r.id).join(", "));
    process.exit(1);
  }
  for (const r of after) {
    if (r.posting_status === "posted" && r.journal_entry_id && !r.reversed_by_je_id) {
      console.error(`FAIL — ${r.id} posted without reversed_by_je_id`);
      process.exit(1);
    }
  }

  console.log(
    "PASS — all 4 arm-31 Check Creator test expenses voided (3 already; 1 voided this run). WORM retained."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
