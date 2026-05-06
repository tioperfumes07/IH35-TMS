import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdDriverIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdLoadIds: string[] = [];
const createdEventIds: { dse: string[]; disp: string[]; cqe: string[] } = { dse: [], disp: [], cqe: [] };

async function runWithBypass<T>(client: pg.PoolClient, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
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
    console.error(`FAIL: ${name} -> ${String((error as Error)?.message || error)}`);
    return false;
  }
}

const client = await pool.connect();
const results: boolean[] = [];

try {
  await client.query("SET ROLE ih35_app");

  const refs = await runWithBypass(client, async () => {
    const ownerRes = await client.query<{ id: string }>(`SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1`);
    if (ownerRes.rows.length === 0) throw new Error("Owner user missing");
    const companyRes = await client.query<{ id: string }>(`SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`);
    if (companyRes.rows.length === 0) throw new Error("TRANSP company missing");
    return { ownerUserId: ownerRes.rows[0].id, companyId: companyRes.rows[0].id };
  });

  results.push(
    await pass("FK constraints exist with ON DELETE SET NULL and ON UPDATE CASCADE", async () => {
      await runWithBypass(client, async () => {
        const fkRes = await client.query<{ conname: string; confdeltype: string; confupdtype: string }>(
          `
            SELECT c.conname, c.confdeltype, c.confupdtype
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'mdata'
              AND c.conname IN (
                'fk_driver_safety_events_related_load',
                'fk_dispatcher_safety_events_related_load',
                'fk_customer_quality_events_related_load'
              )
            ORDER BY c.conname
          `
        );
        if (fkRes.rows.length !== 3) throw new Error(`expected 3 FKs, found ${fkRes.rows.length}`);
        for (const row of fkRes.rows) {
          if (row.confdeltype !== "n") throw new Error(`${row.conname} is not ON DELETE SET NULL`);
          if (row.confupdtype !== "c") throw new Error(`${row.conname} is not ON UPDATE CASCADE`);
        }
      });
    })
  );

  results.push(
    await pass("Invalid load references are rejected for all 3 event tables", async () => {
      const fixture = await runWithBypass(client, async () => {
        const driverUserRes = await client.query<{ id: string }>(
          `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
          [`fk-driver-user-${suffix}@example.com`, `fk-driver-user-${suffix}`, refs.companyId]
        );
        const dispatcherUserRes = await client.query<{ id: string }>(
          `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Dispatcher',$3) RETURNING id`,
          [`fk-disp-user-${suffix}@example.com`, `fk-disp-user-${suffix}`, refs.companyId]
        );
        createdUserIds.push(driverUserRes.rows[0].id, dispatcherUserRes.rows[0].id);

        const driverRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.drivers (
              identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,$2,$3,$4,'Active',$5,$5)
            RETURNING id
          `,
          [driverUserRes.rows[0].id, "FK", "Driver", `+1956${Math.floor(1000000 + Math.random() * 9000000)}`, refs.ownerUserId]
        );
        createdDriverIds.push(driverRes.rows[0].id);

        const customerRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id)
            VALUES ($1,$2,$3,$4,$4)
            RETURNING id
          `,
          [`FK Customer ${suffix}`, `FK-CUST-${suffix}`, refs.companyId, refs.ownerUserId]
        );
        createdCustomerIds.push(customerRes.rows[0].id);

        return {
          driverId: driverRes.rows[0].id,
          dispatcherUserId: dispatcherUserRes.rows[0].id,
          customerId: customerRes.rows[0].id,
        };
      });

      const fakeLoadId = "00000000-0000-0000-0000-000000000001";

      const attempts = [
        {
          sql: `
            INSERT INTO mdata.driver_safety_events (
              driver_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            ) VALUES ($1, 'incident', CURRENT_DATE, 'warning', 'fk reject test', $2, $3, $3)
          `,
          values: [fixture.driverId, fakeLoadId, refs.ownerUserId],
        },
        {
          sql: `
            INSERT INTO mdata.dispatcher_safety_events (
              dispatcher_user_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            ) VALUES ($1, 'other', CURRENT_DATE, 'warning', 'fk reject test', $2, $3, $3)
          `,
          values: [fixture.dispatcherUserId, fakeLoadId, refs.ownerUserId],
        },
        {
          sql: `
            INSERT INTO mdata.customer_quality_events (
              customer_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            ) VALUES ($1, 'other', CURRENT_DATE, 'warning', 'fk reject test', $2, $3, $3)
          `,
          values: [fixture.customerId, fakeLoadId, refs.ownerUserId],
        },
      ];

      for (const attempt of attempts) {
        await runWithBypass(client, async () => {
          try {
            await client.query(attempt.sql, attempt.values);
            throw new Error("expected FK violation did not occur");
          } catch (error) {
            const code = (error as { code?: string }).code;
            if (code !== "23503") throw error;
          }
        });
      }
    })
  );

  results.push(
    await pass("Deleting a load sets related_load_id to NULL (not cascade) for all 3 event tables", async () => {
      await runWithBypass(client, async () => {
        const driverUserRes = await client.query<{ id: string }>(
          `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Driver',$3) RETURNING id`,
          [`fk-del-driver-user-${suffix}@example.com`, `fk-del-driver-user-${suffix}`, refs.companyId]
        );
        const dispatcherUserRes = await client.query<{ id: string }>(
          `INSERT INTO identity.users (email, google_user_id, role, default_company_id) VALUES ($1,$2,'Dispatcher',$3) RETURNING id`,
          [`fk-del-disp-user-${suffix}@example.com`, `fk-del-disp-user-${suffix}`, refs.companyId]
        );
        createdUserIds.push(driverUserRes.rows[0].id, dispatcherUserRes.rows[0].id);

        const driverRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.drivers (
              identity_user_id, first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,$2,$3,$4,'Active',$5,$5)
            RETURNING id
          `,
          [driverUserRes.rows[0].id, "FKDEL", "Driver", `+1956${Math.floor(1000000 + Math.random() * 9000000)}`, refs.ownerUserId]
        );
        createdDriverIds.push(driverRes.rows[0].id);

        const customerRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.customers (customer_name, customer_code, operating_company_id, created_by_user_id, updated_by_user_id)
            VALUES ($1,$2,$3,$4,$4)
            RETURNING id
          `,
          [`FK Delete Customer ${suffix}`, `FK-DEL-CUST-${suffix}`, refs.companyId, refs.ownerUserId]
        );
        createdCustomerIds.push(customerRes.rows[0].id);

        const loadRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.loads (
              operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code, dispatcher_user_id
            )
            VALUES ($1,$2,$3,'booked',100000,'USD',$4)
            RETURNING id
          `,
          [refs.companyId, `LFK-${Date.now()}-${suffix}`, customerRes.rows[0].id, refs.ownerUserId]
        );
        const loadId = loadRes.rows[0].id;
        createdLoadIds.push(loadId);

        const dseRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.driver_safety_events (
              driver_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,'incident',CURRENT_DATE,'warning','set null test',$2,$3,$3)
            RETURNING id
          `,
          [driverRes.rows[0].id, loadId, refs.ownerUserId]
        );
        createdEventIds.dse.push(dseRes.rows[0].id);

        const dispRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.dispatcher_safety_events (
              dispatcher_user_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,'other',CURRENT_DATE,'warning','set null test',$2,$3,$3)
            RETURNING id
          `,
          [dispatcherUserRes.rows[0].id, loadId, refs.ownerUserId]
        );
        createdEventIds.disp.push(dispRes.rows[0].id);

        const cqeRes = await client.query<{ id: string }>(
          `
            INSERT INTO mdata.customer_quality_events (
              customer_id, event_type, event_date, severity, summary, related_load_id, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,'other',CURRENT_DATE,'warning','set null test',$2,$3,$3)
            RETURNING id
          `,
          [customerRes.rows[0].id, loadId, refs.ownerUserId]
        );
        createdEventIds.cqe.push(cqeRes.rows[0].id);

        await client.query("RESET ROLE");
        await client.query(`DELETE FROM mdata.loads WHERE id = $1`, [loadId]);
        await client.query("SET ROLE ih35_app");
        createdLoadIds.splice(createdLoadIds.indexOf(loadId), 1);

        const dseCheck = await client.query<{ related_load_id: string | null }>(
          `SELECT related_load_id FROM mdata.driver_safety_events WHERE id = $1`,
          [dseRes.rows[0].id]
        );
        const dispCheck = await client.query<{ related_load_id: string | null }>(
          `SELECT related_load_id FROM mdata.dispatcher_safety_events WHERE id = $1`,
          [dispRes.rows[0].id]
        );
        const cqeCheck = await client.query<{ related_load_id: string | null }>(
          `SELECT related_load_id FROM mdata.customer_quality_events WHERE id = $1`,
          [cqeRes.rows[0].id]
        );

        if (dseCheck.rows[0]?.related_load_id !== null) throw new Error("driver_safety_events.related_load_id did not nullify");
        if (dispCheck.rows[0]?.related_load_id !== null) throw new Error("dispatcher_safety_events.related_load_id did not nullify");
        if (cqeCheck.rows[0]?.related_load_id !== null) throw new Error("customer_quality_events.related_load_id did not nullify");
      });
    })
  );

  results.push(
    await pass("Zero orphan rows remain in all 3 event tables", async () => {
      await runWithBypass(client, async () => {
        const checks = [
          "SELECT count(*)::int AS orphans FROM mdata.driver_safety_events WHERE related_load_id IS NOT NULL AND related_load_id NOT IN (SELECT id FROM mdata.loads)",
          "SELECT count(*)::int AS orphans FROM mdata.dispatcher_safety_events WHERE related_load_id IS NOT NULL AND related_load_id NOT IN (SELECT id FROM mdata.loads)",
          "SELECT count(*)::int AS orphans FROM mdata.customer_quality_events WHERE related_load_id IS NOT NULL AND related_load_id NOT IN (SELECT id FROM mdata.loads)",
        ];
        for (const sql of checks) {
          const res = await client.query<{ orphans: number }>(sql);
          if (Number(res.rows[0]?.orphans ?? 0) !== 0) throw new Error(`orphans found for query: ${sql}`);
        }
      });
    })
  );

  results.push(
    await pass("audit.audit_events and docs.file_links remain polymorphic (no FK to mdata.loads)", async () => {
      await runWithBypass(client, async () => {
        const fkRes = await client.query<{ table_schema: string; table_name: string; conname: string }>(
          `
            SELECT n.nspname AS table_schema, t.relname AS table_name, c.conname
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_class rt ON rt.oid = c.confrelid
            JOIN pg_namespace rn ON rn.oid = rt.relnamespace
            WHERE c.contype = 'f'
              AND rn.nspname = 'mdata'
              AND rt.relname = 'loads'
              AND (
                (n.nspname = 'audit' AND t.relname = 'audit_events')
                OR (n.nspname = 'docs' AND t.relname = 'file_links')
              )
          `
        );
        if (fkRes.rows.length !== 0) {
          throw new Error(`unexpected loads FK on polymorphic tables: ${JSON.stringify(fkRes.rows)}`);
        }
      });
    })
  );
} catch (error) {
  console.error(`FAIL: setup/flow failed -> ${String((error as Error)?.message || error)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdEventIds.dse.length > 0) {
        await client.query(`DELETE FROM mdata.driver_safety_events WHERE id = ANY($1::uuid[])`, [createdEventIds.dse]);
      }
      if (createdEventIds.disp.length > 0) {
        await client.query(`DELETE FROM mdata.dispatcher_safety_events WHERE id = ANY($1::uuid[])`, [createdEventIds.disp]);
      }
      if (createdEventIds.cqe.length > 0) {
        await client.query(`DELETE FROM mdata.customer_quality_events WHERE id = ANY($1::uuid[])`, [createdEventIds.cqe]);
      }
      if (createdLoadIds.length > 0) {
        await client.query(`DELETE FROM mdata.loads WHERE id = ANY($1::uuid[])`, [createdLoadIds]);
      }
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdCustomerIds.length > 0) {
        await client.query(`DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`, [createdCustomerIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
      console.log("PASS: cleanup fk-events-to-loads fixtures");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error(`FAIL: cleanup fk-events-to-loads fixtures -> ${String((error as Error)?.message || error)}`);
    results.push(false);
  }
  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: FK events-to-loads verification complete.");
  process.exit(0);
}

console.error("FAIL: FK events-to-loads verification failed.");
process.exit(1);
