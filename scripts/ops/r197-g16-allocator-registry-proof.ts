#!/usr/bin/env npx tsx
/**
 * R-197 G-16 — LIVE proof: createCheck through canonical allocator writes
 * banking.check_number_registry (NOT a raw INSERT). Uses stock next_check_number
 * (already 1002 after AUTH-117) — never invents a starting number mid-sequence.
 * Leaves the proof check VOIDED (seat-fixtures law).
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-120 DATABASE_URL=<prod> npx tsx scripts/ops/r197-g16-allocator-registry-proof.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheck } from "../../apps/backend/src/accounting/checks/check-create.service.js";
import { voidCheck } from "../../apps/backend/src/accounting/checks/check-void.service.js";
import { getCheckStockSettings } from "../../apps/backend/src/accounting/checks/check-stock.service.js";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BOA = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const VENDOR = "b60c51c5-1e5f-43a6-a960-044a5ca6138f";
const ACTOR = "86e1e31f-c7b6-4427-bca6-40c5c4cff6d8";

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-120") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-120");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  const before = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const stock = await getCheckStockSettings(client, USMCA, BOA);
    const regCount = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM banking.check_number_registry
        WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    return { stock, registry_count: Number(regCount.rows[0]?.n ?? 0) };
  });
  console.log("BEFORE", before);
  const next = before.stock?.next_check_number;
  if (!next || !/^\d+$/.test(String(next))) {
    console.error("FAIL — stock next_check_number missing; owner must type starting number (never invent)");
    process.exit(1);
  }
  const checkNumber = String(next);

  const created = await createCheck(USMCA, ACTOR, {
    bank_account_id: BOA,
    payee_kind: "vendor",
    payee_id: VENDOR,
    check_date: today,
    print_later: false,
    check_number: checkNumber,
    memo: `AUTH-120 R-197 G-16 allocator registry proof #${checkNumber} — VOID same session`,
    lines: [
      {
        line_kind: "category",
        category_kind: "maintenance",
        category_code: "maintenance",
        amount_cents: 100,
        description: "AUTH-120 proof line $1.00",
      },
    ],
  });
  console.log("CREATED", { id: created.id, check_number: created.check_number, status: created.status });

  const mid = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const reg = await client.query(
      `SELECT id::text, check_number, status, source_id::text, amount_cents
         FROM banking.check_number_registry
        WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid AND check_number = $3`,
      [USMCA, BOA, checkNumber]
    );
    const stock = await getCheckStockSettings(client, USMCA, BOA);
    const count = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    return { registry_row: reg.rows[0], stock_next: stock?.next_check_number, registry_count: Number(count.rows[0]?.n ?? 0) };
  });
  console.log("MID_AFTER_CREATECHECK", mid);
  if (!mid.registry_row) {
    console.error("FAIL — createCheck did not write banking.check_number_registry");
    process.exit(1);
  }
  if (mid.registry_row.source_id !== created.id) {
    console.error("FAIL — registry.source_id must equal expense id from createCheck");
    process.exit(1);
  }
  if (String(mid.registry_row.status) !== "issued") {
    console.error("FAIL — registry status must be issued right after createCheck");
    process.exit(1);
  }

  const voided = await voidCheck(USMCA, ACTOR, created.id, "AUTH-120 re-void after allocator proof (leave voided)");
  console.log("VOIDED", voided);

  const after = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const reg = await client.query(
      `SELECT id::text, check_number, status, voided_at IS NOT NULL AS voided
         FROM banking.check_number_registry
        WHERE operating_company_id = $1::uuid AND check_number = $2`,
      [USMCA, checkNumber]
    );
    const count = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    return { registry_row: reg.rows[0], registry_count: Number(count.rows[0]?.n ?? 0) };
  });
  console.log("AFTER", after);
  if (!after.registry_row?.voided && after.registry_row?.status !== "voided") {
    console.error("FAIL — must leave registry row VOIDED (seat-fixtures law)");
    process.exit(1);
  }

  console.log(
    `AUTH-120 LIVE PROOF PASS — createCheck #${checkNumber} wrote registry id=${mid.registry_row.id} via allocator; left voided; registry_count=${after.registry_count}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
