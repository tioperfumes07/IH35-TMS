// @ts-nocheck
import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);

const createdUsers: string[] = [];
const createdDrivers: string[] = [];
const createdFines: string[] = [];
const createdLiabilities: string[] = [];

async function pass(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name} -> ${String((error as Error).message || error)}`);
    return false;
  }
}

const results: boolean[] = [];
const client = await pool.connect();
let companyId = "";
let ownerId = "";
let subjectDriverId = "";
let convertedFineId = "";
let convertedLiabilityId = "";

try {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS driver_finance;
      CREATE TABLE IF NOT EXISTS driver_finance.driver_liabilities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL,
        driver_id uuid NOT NULL,
        type text NOT NULL,
        source_description text NOT NULL,
        original_amount integer NOT NULL,
        current_balance integer NOT NULL,
        paid_to_date integer NOT NULL DEFAULT 0,
        requires_acknowledgment boolean NOT NULL DEFAULT true,
        origin text,
        origin_id uuid,
        reference_doc_id uuid,
        status text NOT NULL DEFAULT 'pending_recovery',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.driver_liabilities TO ih35_app;
    `);
    const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
    companyId = String(companyRes.rows[0]?.id ?? "");
    if (!companyId) throw new Error("No operating company found");
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
      [`verify-fines-owner-${suffix}@example.com`, `verify-fines-owner-${suffix}`, companyId]
    );
    ownerId = String(ownerRes.rows[0].id);
    createdUsers.push(ownerId);

    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [ownerId, companyId, ownerId]
    );

    const subjectDriverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1,$2,$3,'Active',$4,$4)
        RETURNING id
      `,
      [`Fine${suffix}`, "Subject", `+1956${Math.floor(1000000 + Math.random() * 9000000)}`, ownerId]
    );
    subjectDriverId = String(subjectDriverRes.rows[0].id);
    createdDrivers.push(subjectDriverId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  results.push(
    await pass("insert/update fine flow", async () => {
      await client.query("BEGIN");
      try {
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [ownerId]);
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
        const res = await client.query(
          `
            INSERT INTO safety.civil_fines (
              operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description,
              issued_date, amount_cents, created_by_user_id, updated_by_user_id
            ) VALUES ($1,'driver',$2,'DOT',$3,CURRENT_DATE,12000,$4,$4)
            RETURNING id
          `,
          [companyId, subjectDriverId, `Owner insert ${suffix}`, ownerId]
        );
        convertedFineId = String(res.rows[0].id);
        createdFines.push(convertedFineId);
        await client.query(`UPDATE safety.civil_fines SET status = 'reduced', amount_cents = 11000 WHERE id = $1`, [convertedFineId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    })
  );

  results.push(
    await pass("subject consistency constraint present", async () => {
      const consRes = await client.query(
        `SELECT 1 FROM pg_constraint WHERE conrelid = 'safety.civil_fines'::regclass AND conname = 'chk_fine_subject_consistency'`
      );
      if (consRes.rows.length !== 1) throw new Error("chk_fine_subject_consistency missing");
    })
  );

  results.push(
    await pass("conversion creates liability provenance", async () => {
      await client.query("BEGIN");
      try {
        const liaRes = await client.query(
          `
            INSERT INTO driver_finance.driver_liabilities (
              operating_company_id, driver_id, type, source_description, original_amount, current_balance, paid_to_date,
              requires_acknowledgment, origin, origin_id, status
            )
            VALUES ($1,$2,'civil_fine',$3,11000,11000,0,true,'safety_fine',$4,'pending_recovery')
            RETURNING id
          `,
          [companyId, subjectDriverId, `Fine conversion ${suffix}`, convertedFineId]
        );
        convertedLiabilityId = String(liaRes.rows[0].id);
        createdLiabilities.push(convertedLiabilityId);

        await client.query(
          `
            UPDATE safety.civil_fines
            SET converted_to_liability_id = $2,
                converted_at = now(),
                converted_by_user_id = $3
            WHERE id = $1
          `,
          [convertedFineId, convertedLiabilityId, ownerId]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    })
  );

  results.push(
    await pass("audit rows + liability provenance", async () => {
      await client.query("BEGIN");
      try {
        await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
        await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4,$5)`, [
          "safety.fine.created",
          "info",
          JSON.stringify({ fine_id: convertedFineId, operating_company_id: companyId }),
          ownerId,
          "BT-3-SAFETY-GAPS-FILL",
        ]);
        await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,$4,$5)`, [
          "safety.fine.converted_to_liability",
          "warning",
          JSON.stringify({ fine_id: convertedFineId, liability_id: convertedLiabilityId, workflow: "WF-035" }),
          ownerId,
          "BT-3-SAFETY-GAPS-FILL",
        ]);

        const provRes = await client.query(
          `
            SELECT origin, origin_id
            FROM driver_finance.driver_liabilities
            WHERE id = $1
            LIMIT 1
          `,
          [convertedLiabilityId]
        );
        if (!provRes.rows[0]) throw new Error("Converted liability missing");
        if (String(provRes.rows[0].origin) !== "safety_fine") throw new Error("Expected origin=safety_fine");
        if (String(provRes.rows[0].origin_id) !== convertedFineId) throw new Error("Expected origin_id to point to fine");
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    })
  );
} catch (error) {
  console.error(`FAIL: setup failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (createdFines.length > 0) await client.query(`DELETE FROM safety.civil_fines WHERE id = ANY($1::uuid[])`, [createdFines]);
    if (createdLiabilities.length > 0) await client.query(`DELETE FROM driver_finance.driver_liabilities WHERE id = ANY($1::uuid[])`, [createdLiabilities]);
    if (createdDrivers.length > 0) await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDrivers]);
    if (createdUsers.length > 0) await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUsers]);
    await client.query("COMMIT");
    console.log("PASS: cleanup db-verify-fines fixtures");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`FAIL: cleanup db-verify-fines fixtures -> ${String((error as Error).message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: db-verify-fines complete.");
  process.exit(0);
}
console.error("FAIL: db-verify-fines failed.");
process.exit(1);
