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

const createdUserIds = [];
const fixtureIds = {};
const managerRowIds = {};

function makeCode(prefix) {
  return `${prefix}-${suffix}`;
}

function isDeniedError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level security policy")
  );
}

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

async function runAsUser(client, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
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

const tableConfigs = [
  {
    name: "drivers",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, email, status, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, 'Active', $5, $6)
        RETURNING id
      `,
      values: ["Fixture", "Driver", "555-1000", `fixture-driver-${ctx.suffix}@example.com`, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, email, status, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, 'Active', $5, $6)
        RETURNING id
      `,
      values: ["Manager", "Driver", "555-2000", `manager-driver-${ctx.suffix}@example.com`, "manager insert", ctx.managerUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.drivers (
          first_name, last_name, phone, email, status, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, 'Active', $5, $6)
        RETURNING id
      `,
      values: ["Driver", "Denied", "555-3000", `driver-denied-${ctx.suffix}@example.com`, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.drivers SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.drivers SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "units",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.units (
          unit_number, vin, status, assigned_driver_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'InService', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        makeCode("FIX-UNIT"),
        makeCode("FIXVINUNIT"),
        ctx.fixtureIds.drivers,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "fixture",
        ctx.ownerUserId,
      ],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.units (
          unit_number, vin, status, assigned_driver_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'InService', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        makeCode("MGR-UNIT"),
        makeCode("MGRVINUNIT"),
        ctx.fixtureIds.drivers,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "manager insert",
        ctx.managerUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.units (
          unit_number, vin, status, assigned_driver_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'InService', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        makeCode("DRV-UNIT"),
        makeCode("DRVVINUNIT"),
        ctx.fixtureIds.drivers,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "driver insert",
        ctx.driverUserId,
      ],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.units SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.units SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "customers",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.customers (
          customer_name, customer_code, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      values: [`Fixture Customer ${ctx.suffix}`, makeCode("FIX-CUST"), ctx.transpCompanyId, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.customers (
          customer_name, customer_code, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      values: [
        `Manager Customer ${ctx.suffix}`,
        makeCode("MGR-CUST"),
        ctx.transpCompanyId,
        "manager insert",
        ctx.managerUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.customers (
          customer_name, customer_code, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      values: [`Driver Customer ${ctx.suffix}`, makeCode("DRV-CUST"), ctx.transpCompanyId, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.customers SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.customers SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "vendors",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.vendors (
          vendor_name, vendor_code, vendor_type, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Repair', $3, $4, $5)
        RETURNING id
      `,
      values: [`Fixture Vendor ${ctx.suffix}`, makeCode("FIX-VEND"), ctx.transpCompanyId, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.vendors (
          vendor_name, vendor_code, vendor_type, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Fuel', $3, $4, $5)
        RETURNING id
      `,
      values: [`Manager Vendor ${ctx.suffix}`, makeCode("MGR-VEND"), ctx.transpCompanyId, "manager insert", ctx.managerUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.vendors (
          vendor_name, vendor_code, vendor_type, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Tires', $3, $4, $5)
        RETURNING id
      `,
      values: [`Driver Vendor ${ctx.suffix}`, makeCode("DRV-VEND"), ctx.transpCompanyId, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.vendors SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.vendors SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "locations",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.locations (
          location_name, location_code, location_type, linked_customer_id, linked_vendor_id, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Other', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        `Fixture Location ${ctx.suffix}`,
        makeCode("FIX-LOC"),
        ctx.fixtureIds.customers,
        ctx.fixtureIds.vendors,
        ctx.transpCompanyId,
        "fixture",
        ctx.ownerUserId,
      ],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.locations (
          location_name, location_code, location_type, linked_customer_id, linked_vendor_id, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Other', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        `Manager Location ${ctx.suffix}`,
        makeCode("MGR-LOC"),
        ctx.fixtureIds.customers,
        ctx.fixtureIds.vendors,
        ctx.transpCompanyId,
        "manager insert",
        ctx.managerUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.locations (
          location_name, location_code, location_type, linked_customer_id, linked_vendor_id, operating_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Other', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      values: [
        `Driver Location ${ctx.suffix}`,
        makeCode("DRV-LOC"),
        ctx.fixtureIds.customers,
        ctx.fixtureIds.vendors,
        ctx.transpCompanyId,
        "driver insert",
        ctx.driverUserId,
      ],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.locations SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.locations SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "equipment",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment (
          equipment_number, vin, equipment_type, status, current_unit_id, current_location_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'DryVan', 'InService', $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      values: [
        makeCode("FIX-EQP"),
        makeCode("FIXVINEQP"),
        ctx.fixtureIds.units,
        ctx.fixtureIds.locations,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "fixture",
        ctx.ownerUserId,
      ],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment (
          equipment_number, vin, equipment_type, status, current_unit_id, current_location_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Flatbed', 'InService', $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      values: [
        makeCode("MGR-EQP"),
        makeCode("MGRVINEQP"),
        ctx.fixtureIds.units,
        ctx.fixtureIds.locations,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "manager insert",
        ctx.managerUserId,
      ],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment (
          equipment_number, vin, equipment_type, status, current_unit_id, current_location_id, owner_company_id, currently_leased_to_company_id, notes, created_by_user_id
        ) VALUES ($1, $2, 'Reefer', 'InService', $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      values: [
        makeCode("DRV-EQP"),
        makeCode("DRVVINEQP"),
        ctx.fixtureIds.units,
        ctx.fixtureIds.locations,
        ctx.trkCompanyId,
        ctx.transpCompanyId,
        "driver insert",
        ctx.driverUserId,
      ],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.equipment SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.equipment SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
  {
    name: "equipment_log",
    bypassInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment_log (
          equipment_id, event_type, from_unit_id, to_unit_id, notes, created_by_user_id
        ) VALUES ($1, 'Note', $2, $2, $3, $4)
        RETURNING id
      `,
      values: [ctx.fixtureIds.equipment, ctx.fixtureIds.units, "fixture", ctx.ownerUserId],
    }),
    managerInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment_log (
          equipment_id, event_type, from_unit_id, to_unit_id, notes, created_by_user_id
        ) VALUES ($1, 'Moved', $2, $2, $3, $4)
        RETURNING id
      `,
      values: [ctx.fixtureIds.equipment, ctx.fixtureIds.units, "manager insert", ctx.managerUserId],
    }),
    driverInsert: (ctx) => ({
      sql: `
        INSERT INTO mdata.equipment_log (
          equipment_id, event_type, from_unit_id, to_unit_id, notes, created_by_user_id
        ) VALUES ($1, 'Moved', $2, $2, $3, $4)
        RETURNING id
      `,
      values: [ctx.fixtureIds.equipment, ctx.fixtureIds.units, "driver insert", ctx.driverUserId],
    }),
    managerUpdate: () => ({
      sql: `UPDATE mdata.equipment_log SET notes = 'manager updated' WHERE id = $1`,
    }),
    driverUpdate: () => ({
      sql: `UPDATE mdata.equipment_log SET notes = 'driver updated' WHERE id = $1`,
    }),
  },
];

const client = await pool.connect();
const results = [];

try {
  await client.query("SET ROLE ih35_app");

  const userIds = await runWithBypass(client, async () => {
    const owner = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Owner') RETURNING id`,
      [`mdata-owner-${suffix}@example.com`, `mdata-owner-${suffix}`]
    );
    const manager = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Manager') RETURNING id`,
      [`mdata-manager-${suffix}@example.com`, `mdata-manager-${suffix}`]
    );
    const dispatcher = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Dispatcher') RETURNING id`,
      [`mdata-dispatcher-${suffix}@example.com`, `mdata-dispatcher-${suffix}`]
    );
    const driver = await client.query(
      `INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, 'Driver') RETURNING id`,
      [`mdata-driver-${suffix}@example.com`, `mdata-driver-${suffix}`]
    );
    return {
      ownerUserId: String(owner.rows[0].id),
      managerUserId: String(manager.rows[0].id),
      dispatcherUserId: String(dispatcher.rows[0].id),
      driverUserId: String(driver.rows[0].id),
    };
  });

  createdUserIds.push(userIds.ownerUserId, userIds.managerUserId, userIds.dispatcherUserId, userIds.driverUserId);

  const companyRes = await runWithBypass(client, async () => {
    const res = await client.query(`SELECT code, id FROM org.companies WHERE code IN ('TRK', 'TRANSP', 'USMCA')`);
    const byCode = new Map(res.rows.map((row) => [row.code, row.id]));
    return {
      trkCompanyId: byCode.get("TRK") ?? "",
      transpCompanyId: byCode.get("TRANSP") ?? "",
      usmcaCompanyId: byCode.get("USMCA") ?? "",
    };
  });

  await runWithBypass(client, async () => {
    await client.query(
      `
        INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
        VALUES
          ($1, $4, $1),
          ($2, $4, $1),
          ($3, $4, $1)
        ON CONFLICT (user_id, company_id) DO NOTHING
      `,
      [userIds.managerUserId, userIds.dispatcherUserId, userIds.driverUserId, companyRes.transpCompanyId]
    );
    await client.query(
      `UPDATE identity.users SET default_company_id = $2 WHERE id IN ($1, $3, $4)`,
      [userIds.managerUserId, companyRes.transpCompanyId, userIds.dispatcherUserId, userIds.driverUserId]
    );
  });

  for (const cfg of tableConfigs) {
    const ctx = {
      suffix,
      ...userIds,
      ...companyRes,
      fixtureIds,
      managerRowIds,
    };

    results.push(
      await pass(`${cfg.name}: bypass fixture insert`, async () => {
        const insertedId = await runWithBypass(client, async () => {
          const q = cfg.bypassInsert(ctx);
          const res = await client.query(q.sql, q.values);
          return String(res.rows[0].id);
        });
        fixtureIds[cfg.name] = insertedId;
      })
    );

    results.push(
      await pass(`${cfg.name}: driver SELECT succeeds`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const res = await client.query(`SELECT id FROM mdata.${cfg.name} WHERE id = $1`, [fixtureIds[cfg.name]]);
          if (res.rowCount !== 1) {
            throw new Error("expected driver to read fixture row");
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: driver INSERT rejected`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const q = cfg.driverInsert(ctx);
          try {
            await client.query(q.sql, q.values);
            throw new Error("driver insert unexpectedly succeeded");
          } catch (err) {
            if (!isDeniedError(err)) {
              throw err;
            }
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: manager INSERT succeeds`, async () => {
        const managerId = await runAsUser(client, userIds.managerUserId, async () => {
          const q = cfg.managerInsert(ctx);
          const res = await client.query(q.sql, q.values);
          return String(res.rows[0].id);
        });
        managerRowIds[cfg.name] = managerId;
      })
    );

    results.push(
      await pass(`${cfg.name}: manager UPDATE succeeds`, async () => {
        await runAsUser(client, userIds.managerUserId, async () => {
          const q = cfg.managerUpdate(ctx);
          const res = await client.query(q.sql, [managerRowIds[cfg.name]]);
          if (res.rowCount !== 1) {
            throw new Error(`expected manager update rowCount=1 got ${res.rowCount}`);
          }
        });
      })
    );

    results.push(
      await pass(`${cfg.name}: driver UPDATE rejected`, async () => {
        await runAsUser(client, userIds.driverUserId, async () => {
          const q = cfg.driverUpdate(ctx);
          try {
            const res = await client.query(q.sql, [managerRowIds[cfg.name]]);
            if (res.rowCount !== 0) {
              throw new Error(`driver update unexpectedly affected ${res.rowCount} rows`);
            }
          } catch (err) {
            if (!isDeniedError(err)) {
              throw err;
            }
          }
        });
      })
    );
  }
} catch (err) {
  console.error(`FAIL: setup/test execution -> ${String(err?.message || err)}`);
  results.push(false);
} finally {
  try {
    await client.query("RESET ROLE");
    await client.query("BEGIN");
    if (fixtureIds.equipment_log || managerRowIds.equipment_log) {
      await client.query(
        `DELETE FROM mdata.equipment_log WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.equipment_log, managerRowIds.equipment_log].filter(Boolean)]
      );
    }
    if (fixtureIds.equipment || managerRowIds.equipment) {
      await client.query(
        `DELETE FROM mdata.equipment WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.equipment, managerRowIds.equipment].filter(Boolean)]
      );
    }
    if (fixtureIds.locations || managerRowIds.locations) {
      await client.query(
        `DELETE FROM mdata.locations WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.locations, managerRowIds.locations].filter(Boolean)]
      );
    }
    if (fixtureIds.units || managerRowIds.units) {
      await client.query(
        `DELETE FROM mdata.units WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.units, managerRowIds.units].filter(Boolean)]
      );
    }
    if (fixtureIds.customers || managerRowIds.customers) {
      await client.query(
        `DELETE FROM mdata.customers WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.customers, managerRowIds.customers].filter(Boolean)]
      );
    }
    if (fixtureIds.vendors || managerRowIds.vendors) {
      await client.query(
        `DELETE FROM mdata.vendors WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.vendors, managerRowIds.vendors].filter(Boolean)]
      );
    }
    if (fixtureIds.drivers || managerRowIds.drivers) {
      await client.query(
        `DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`,
        [[fixtureIds.drivers, managerRowIds.drivers].filter(Boolean)]
      );
    }
    if (createdUserIds.length > 0) {
      await client.query(`DELETE FROM identity.users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
    }
    await client.query("COMMIT");
    console.log("PASS: cleanup mdata fixtures");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`FAIL: cleanup mdata fixtures -> ${String(err?.message || err)}`);
    results.push(false);
  }

  client.release();
  await pool.end();
}

if (results.every(Boolean)) {
  console.log("PASS: mdata RLS verification complete.");
  process.exit(0);
}

console.error("FAIL: mdata RLS verification failed.");
process.exit(1);
