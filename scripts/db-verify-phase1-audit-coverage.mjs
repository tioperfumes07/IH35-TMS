import dotenv from "dotenv";
import pg from "pg";
import crypto from "node:crypto";

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL;

if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL in environment.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const suffix = crypto.randomUUID().slice(0, 8);
const coverageRunId = `phase1-audit-${suffix}`;
const createdUserIds = [];
const createdDriverIds = [];

const EVENT_CLASSES = [
  "identity.users.created",
  "identity.users.updated",
  "identity.users.deactivated",
  "mdata.drivers.created",
  "mdata.drivers.updated",
  "mdata.drivers.deactivated",
  "mdata.units.created",
  "mdata.units.updated",
  "mdata.units.deactivated",
  "mdata.customers.created",
  "mdata.customers.updated",
  "mdata.customers.deactivated",
  "mdata.vendors.created",
  "mdata.vendors.updated",
  "mdata.vendors.deactivated",
  "mdata.locations.created",
  "mdata.locations.updated",
  "mdata.locations.deactivated",
  "mdata.equipment.created",
  "mdata.equipment.updated",
  "mdata.equipment.deactivated",
  "mdata.equipment_log.created",
  "catalogs.accounts.created",
  "catalogs.accounts.updated",
  "catalogs.accounts.deactivated",
  "catalogs.classes.created",
  "catalogs.classes.updated",
  "catalogs.classes.deactivated",
  "catalogs.items.created",
  "catalogs.items.updated",
  "catalogs.items.deactivated",
  "catalogs.payment_terms.created",
  "catalogs.payment_terms.updated",
  "catalogs.payment_terms.deactivated",
  "catalogs.posting_templates.created",
  "catalogs.posting_templates.updated",
  "catalogs.posting_templates.is_active_changed",
  "catalogs.account_role_bindings.created",
  "catalogs.account_role_bindings.updated",
  "auth.phone.verification_started",
  "auth.phone.verification_fallback_sms",
  "auth.phone.verified",
  "identity.users.deactivated_via_driver_deactivation",
  "org.companies.updated",
  "org.user_company_access.granted",
  "catalogs.equipment_types.created",
  "catalogs.equipment_types.updated",
  "catalogs.equipment_line_item_templates.created",
  "catalogs.equipment_line_item_templates.updated",
  "catalogs.driver_load_statuses.created",
  "catalogs.driver_load_statuses.updated",
  "catalogs.catalog_registry.created",
  "catalogs.catalog_registry.updated",
  "mdata.driver_equipment_qualifications.created",
  "mdata.driver_equipment_qualifications.updated",
  "mdata.driver_equipment_qualifications.deactivated",
  "mdata.driver_equipment_qualifications.reactivated",
  "mdata.driver_pay_rates.created",
  "mdata.driver_pay_rates.changed",
  "mdata.driver_company_authorizations.granted",
  "mdata.driver_company_authorizations.revoked",
  "mdata.driver_company_authorizations.updated",
];

const WARNING_EVENTS = new Set([
  "identity.users.updated",
  "identity.users.deactivated_via_driver_deactivation",
  "catalogs.posting_templates.is_active_changed",
  "catalogs.account_role_bindings.created",
  "catalogs.account_role_bindings.updated",
  "auth.phone.verification_fallback_sms",
]);

async function runWithBypass(client, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function pass(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${name} -> ${String(err?.message || err)}`);
    return false;
  }
}

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const { ownerId } = await runWithBypass(client, async () => {
    const ownerRes = await client.query(
      `
        INSERT INTO identity.users (email, google_user_id, role)
        VALUES ($1, $2, 'Owner')
        RETURNING id
      `,
      [`phase1-audit-owner-${suffix}@example.com`, `phase1-audit-owner-${suffix}`]
    );
    const ownerId = String(ownerRes.rows[0].id);
    createdUserIds.push(ownerId);

    const driverRes = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, status, created_by_user_id, updated_by_user_id
        ) VALUES ($1, $2, $3, 'Active', $4, $4)
        RETURNING id
      `,
      [`Audit-${suffix}`, "Fixture", `555-${suffix.slice(0, 4)}`, ownerId]
    );
    createdDriverIds.push(String(driverRes.rows[0].id));

    return { ownerId };
  });

  results.push(
    await pass(`All ${EVENT_CLASSES.length} CRUD event classes append successfully`, async () => {
      await runWithBypass(client, async () => {
        for (const eventClass of EVENT_CLASSES) {
          const severity = WARNING_EVENTS.has(eventClass) ? "warning" : "info";
          await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
            eventClass,
            severity,
            JSON.stringify({
              coverage_run_id: coverageRunId,
              event_class: eventClass,
              resource_id: createdDriverIds[0],
              resource_type: "coverage.check",
            }),
            ownerId,
            "BT-1-PHASE1-AUDIT",
          ]);
        }
      });
    })
  );

  results.push(
    await pass(`Coverage run wrote all ${EVENT_CLASSES.length} expected audit rows`, async () => {
      await client.query("RESET ROLE");
      await client.query("BEGIN");
      try {
        const countRes = await client.query(
          `
            SELECT count(*)::int AS cnt
            FROM audit.audit_events
            WHERE source = 'BT-1-PHASE1-AUDIT'
              AND payload ->> 'coverage_run_id' = $1
          `,
          [coverageRunId]
        );
        const count = Number(countRes.rows[0]?.cnt ?? 0);
        if (count !== EVENT_CLASSES.length) {
          throw new Error(`expected ${EVENT_CLASSES.length} rows, got ${count}`);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        await client.query("SET ROLE ih35_app");
      }
    })
  );
} catch (err) {
  console.error(`FAIL: setup/flow failed -> ${String(err?.message || err)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    try {
      if (createdDriverIds.length > 0) {
        await client.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [createdDriverIds]);
      }
      if (createdUserIds.length > 0) {
        await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log("PASS: cleanup phase1 audit coverage fixtures");
  } catch (err) {
    console.error(`FAIL: cleanup phase1 audit coverage fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: phase1 audit coverage verification complete.");
  process.exit(0);
}

console.error("FAIL: phase1 audit coverage verification failed.");
process.exit(1);
