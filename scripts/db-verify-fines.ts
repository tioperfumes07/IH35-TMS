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

async function runWithBypass(client: pg.PoolClient, fn: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await fn();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runAsUser(client: pg.PoolClient, userId: string, companyId: string, fn: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    await fn();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

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
let safetyId = "";
let driverRoleUserId = "";
let subjectDriverId = "";
let convertedFineId = "";
let convertedLiabilityId = "";

try {
  await client.query("SET ROLE ih35_app");

  await runWithBypass(client, async () => {
    const companyRes = await client.query(`SELECT id FROM org.companies ORDER BY created_at LIMIT 1`);
    companyId = String(companyRes.rows[0]?.id ?? "");
    if (!companyId) throw new Error("No operating company found");
    const ownerRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Owner',$3) RETURNING id`,
      [`verify-fines-owner-${suffix}@example.com`, `verify-fines-owner-${suffix}`, companyId]
    );
    const safetyRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Safety',$3) RETURNING id`,
      [`verify-fines-safety-${suffix}@example.com`, `verify-fines-safety-${suffix}`, companyId]
    );
    const driverRoleRes = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
      [`verify-fines-driver-role-${suffix}@example.com`, `verify-fines-driver-role-${suffix}`, companyId]
    );
    ownerId = String(ownerRes.rows[0].id);
    safetyId = String(safetyRes.rows[0].id);
    driverRoleUserId = String(driverRoleRes.rows[0].id);
    createdUsers.push(ownerId, safetyId, driverRoleUserId);

    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [ownerId, companyId, ownerId]
    );
    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [safetyId, companyId, ownerId]
    );
    await client.query(
      `INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [driverRoleUserId, companyId, ownerId]
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
  });

  results.push(
    await pass("RLS allows Safety insert and blocks Driver role insert", async () => {
      await runAsUser(client, safetyId, companyId, async () => {
        const res = await client.query(
          `
            INSERT INTO safety.fines (
              operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description,
              issued_date, amount_cents, created_by_user_id, updated_by_user_id
            ) VALUES ($1,'driver',$2,'DOT',$3,CURRENT_DATE,12000,$4,$4)
            RETURNING id
          `,
          [companyId, subjectDriverId, `Safety insert ${suffix}`, safetyId]
        );
        createdFines.push(String(res.rows[0].id));
      });

      let blocked = false;
      try {
        await runAsUser(client, driverRoleUserId, companyId, async () => {
          await client.query(
            `
              INSERT INTO safety.fines (
                operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description,
                issued_date, amount_cents, created_by_user_id, updated_by_user_id
              ) VALUES ($1,'driver',$2,'DOT',$3,CURRENT_DATE,1000,$4,$4)
            `,
            [companyId, subjectDriverId, `Driver insert ${suffix}`, driverRoleUserId]
          );
        });
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error("Driver role insert unexpectedly succeeded");
    })
  );

  results.push(
    await pass("chk_fine_subject_consistency CHECK blocks invalid payload", async () => {
      await runWithBypass(client, async () => {
        let failed = false;
        try {
          await client.query(
            `
              INSERT INTO safety.fines (
                operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description,
                issued_date, amount_cents, created_by_user_id, updated_by_user_id
              ) VALUES ($1,'driver',NULL,'DOT','bad consistency',CURRENT_DATE,1000,$2,$2)
            `,
            [companyId, ownerId]
          );
        } catch (error: any) {
          failed = String(error.code) === "23514";
        }
        if (!failed) throw new Error("Expected CHECK violation");
      });
    })
  );

  results.push(
    await pass("conversion lock + uniqueness behavior", async () => {
      await runWithBypass(client, async () => {
        const fineRes = await client.query(
          `
            INSERT INTO safety.fines (
              operating_company_id, subject_type, subject_driver_id, issued_by_authority, violation_description,
              issued_date, amount_cents, created_by_user_id, updated_by_user_id
            ) VALUES ($1,'driver',$2,'FMCSA',$3,CURRENT_DATE,25000,$4,$4)
            RETURNING id
          `,
          [companyId, subjectDriverId, `Convert flow ${suffix}`, ownerId]
        );
        convertedFineId = String(fineRes.rows[0].id);
        createdFines.push(convertedFineId);

        const liaRes = await client.query(
          `
            INSERT INTO driver_finance.driver_liabilities (
              operating_company_id, driver_id, type, source_description, original_amount, current_balance, paid_to_date,
              requires_acknowledgment, origin, origin_id, status
            )
            VALUES ($1,$2,'civil_fine',$3,25000,25000,0,true,'safety_fine',$4,'pending_recovery')
            RETURNING id
          `,
          [companyId, subjectDriverId, `Fine conversion ${suffix}`, convertedFineId]
        );
        convertedLiabilityId = String(liaRes.rows[0].id);
        createdLiabilities.push(convertedLiabilityId);

        await client.query(
          `
            UPDATE safety.fines
            SET converted_to_liability_id = $2,
                converted_at = now(),
                converted_by_user_id = $3
            WHERE id = $1
          `,
          [convertedFineId, convertedLiabilityId, ownerId]
        );

        const secondLiaRes = await client.query(
          `
            INSERT INTO driver_finance.driver_liabilities (
              operating_company_id, driver_id, type, source_description, original_amount, current_balance, paid_to_date,
              requires_acknowledgment, origin, origin_id, status
            )
            VALUES ($1,$2,'civil_fine',$3,100,100,0,true,'safety_fine',$4,'pending_recovery')
            RETURNING id
          `,
          [companyId, subjectDriverId, `Second convert ${suffix}`, convertedFineId]
        );
        const secondLiabilityId = String(secondLiaRes.rows[0].id);
        createdLiabilities.push(secondLiabilityId);

        let uniqueFailed = false;
        try {
          await client.query(`UPDATE safety.fines SET converted_to_liability_id = $2 WHERE id = $1`, [convertedFineId, secondLiabilityId]);
        } catch {
          uniqueFailed = true;
        }
        if (!uniqueFailed) throw new Error("Expected unique constraint failure on second conversion");

        let lockFailed = false;
        try {
          await client.query(`UPDATE safety.fines SET amount_cents = 99999 WHERE id = $1`, [convertedFineId]);
        } catch (error: any) {
          lockFailed = String(error.message).includes("E_FINE_LOCKED_AFTER_CONVERSION");
        }
        if (!lockFailed) throw new Error("Expected E_FINE_LOCKED_AFTER_CONVERSION on amount change");

        await client.query(`UPDATE safety.fines SET status = 'paid' WHERE id = $1`, [convertedFineId]);
      });
    })
  );

  results.push(
    await pass("audit rows + liability provenance", async () => {
      await runWithBypass(client, async () => {
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

        const auditRes = await client.query(
          `
            SELECT event_class
            FROM audit.audit_events
            WHERE event_class IN ('safety.fine.created','safety.fine.converted_to_liability')
              AND payload->>'fine_id' = $1
          `,
          [convertedFineId]
        );
        const classes = new Set(auditRes.rows.map((row) => row.event_class));
        if (!classes.has("safety.fine.created")) throw new Error("Missing safety.fine.created");
        if (!classes.has("safety.fine.converted_to_liability")) throw new Error("Missing safety.fine.converted_to_liability");

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
      });
    })
  );
} catch (error) {
  console.error(`FAIL: setup failed -> ${String((error as Error).message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (createdFines.length > 0) await client.query(`DELETE FROM safety.fines WHERE id = ANY($1::uuid[])`, [createdFines]);
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
