import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!connectionString) {
  console.error("FAIL: Missing DATABASE_URL or DATABASE_DIRECT_URL");
  process.exit(1);
}

const REQUESTED_OPERATING_COMPANY_ID = "1121695a-87b0-4464-91a5-f907b348f4d6";
const TEST_CUSTOMER_CODE = "TEST-BROKER-001";
const TEST_UNIT_NUMBERS = ["TEST-UNIT-001", "TEST-UNIT-002"];
const TEST_DRIVER_EMAILS = ["test-driver-a@example.invalid", "test-driver-b@example.invalid"];
const TEST_TRAILER_NUMBER = "TEST-TRL-001";

const DRIVER_FIXTURES = [
  {
    firstName: "TEST",
    lastName: "DriverAlpha",
    email: "test-driver-a@example.invalid",
    phone: "+15555550100",
    cdlNumber: "CDL-TEST-A",
  },
  {
    firstName: "TEST",
    lastName: "DriverBeta",
    email: "test-driver-b@example.invalid",
    phone: "+15555550101",
    cdlNumber: "CDL-TEST-B",
  },
];

const UNIT_FIXTURES = [
  {
    unitNumber: "TEST-UNIT-001",
    vin: "1FUJBBCK5XLA00001",
    plate: "TST001",
  },
  {
    unitNumber: "TEST-UNIT-002",
    vin: "1FUJBBCK5XLA00002",
    plate: "TST002",
  },
];

const cleanupMode = process.argv.includes("--cleanup");
const client = new pg.Client({ connectionString });
let operatingCompanyId = REQUESTED_OPERATING_COMPANY_ID;

async function tableExists(schema, table) {
  const res = await client.query(`SELECT to_regclass($1) AS reg;`, [`${schema}.${table}`]);
  return Boolean(res.rows[0]?.reg);
}

async function resolveOperatingCompanyId() {
  const byId = await client.query(
    `
      SELECT id
      FROM org.companies
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [REQUESTED_OPERATING_COMPANY_ID]
  );
  if (byId.rows[0]?.id) {
    operatingCompanyId = byId.rows[0].id;
    return;
  }

  const byName = await client.query(
    `
      SELECT id
      FROM org.companies
      WHERE short_name ILIKE '%IH 35 Trucking%'
         OR legal_name ILIKE '%IH 35 Trucking%'
      ORDER BY id
      LIMIT 1
    `
  );
  if (!byName.rows[0]?.id) {
    throw new Error("Could not resolve IH 35 Trucking operating company id");
  }
  operatingCompanyId = byName.rows[0].id;
  console.log(
    `seed: requested company id ${REQUESTED_OPERATING_COMPANY_ID} not found, using resolved id ${operatingCompanyId}`
  );
}

async function cleanup() {
  const customerRes = await client.query(
    `
      SELECT id
      FROM mdata.customers
      WHERE customer_code = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [TEST_CUSTOMER_CODE, operatingCompanyId]
  );
  const customerId = customerRes.rows[0]?.id ?? null;

  const driverRes = await client.query(
    `
      SELECT id
      FROM mdata.drivers
      WHERE email = ANY($1::text[])
        AND operating_company_id = $2
    `,
    [TEST_DRIVER_EMAILS, operatingCompanyId]
  );
  const driverIds = driverRes.rows.map((row) => row.id);

  const unitRes = await client.query(
    `
      SELECT id
      FROM mdata.units
      WHERE unit_number = ANY($1::text[])
        AND owner_company_id = $2
    `,
    [TEST_UNIT_NUMBERS, operatingCompanyId]
  );
  const unitIds = unitRes.rows.map((row) => row.id);

  const loadDelete = await client.query(
    `
      DELETE FROM mdata.loads
      WHERE operating_company_id = $1
        AND (
          ($2::uuid IS NOT NULL AND customer_id = $2::uuid)
          OR assigned_primary_driver_id = ANY($3::uuid[])
          OR assigned_secondary_driver_id = ANY($3::uuid[])
          OR assigned_unit_id = ANY($4::uuid[])
        )
    `,
    [operatingCompanyId, customerId, driverIds, unitIds]
  );
  console.log(`cleanup: deleted loads=${loadDelete.rowCount}`);

  const driverBillTables = [
    ["driver_finance", "driver_bills"],
    ["accounting", "driver_bills"],
    ["mdata", "driver_bills"],
  ];
  for (const [schema, table] of driverBillTables) {
    if (!(await tableExists(schema, table))) continue;
    const colRes = await client.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
      `,
      [schema, table]
    );
    const cols = new Set(colRes.rows.map((row) => row.column_name));
    if (cols.has("load_id")) {
      const deleted = await client.query(
        `DELETE FROM ${schema}.${table} WHERE load_id IN (
          SELECT id FROM mdata.loads WHERE operating_company_id = $1 AND customer_id = $2::uuid
        )`,
        [operatingCompanyId, customerId]
      );
      console.log(`cleanup: deleted ${schema}.${table} by load_id=${deleted.rowCount}`);
    } else if (cols.has("driver_id")) {
      const deleted = await client.query(
        `DELETE FROM ${schema}.${table} WHERE driver_id = ANY($1::uuid[])`,
        [driverIds]
      );
      console.log(`cleanup: deleted ${schema}.${table} by driver_id=${deleted.rowCount}`);
    } else {
      console.log(`cleanup: skipped ${schema}.${table} (no load_id/driver_id column)`);
    }
  }

  if (await tableExists("mdata", "trailers")) {
    const trailerDelete = await client.query(
      `
        DELETE FROM mdata.trailers
        WHERE trailer_number = $1
          AND operating_company_id = $2
      `,
      [TEST_TRAILER_NUMBER, operatingCompanyId]
    );
    console.log(`cleanup: deleted trailers=${trailerDelete.rowCount}`);
  } else {
    console.log("cleanup: skipped trailer delete (mdata.trailers does not exist)");
  }

  const driverDelete = await client.query(
    `
      DELETE FROM mdata.drivers
      WHERE email = ANY($1::text[])
        AND operating_company_id = $2
    `,
    [TEST_DRIVER_EMAILS, operatingCompanyId]
  );
  console.log(`cleanup: deleted drivers=${driverDelete.rowCount}`);

  const unitDelete = await client.query(
    `
      DELETE FROM mdata.units
      WHERE unit_number = ANY($1::text[])
        AND owner_company_id = $2
    `,
    [TEST_UNIT_NUMBERS, operatingCompanyId]
  );
  console.log(`cleanup: deleted units=${unitDelete.rowCount}`);

  const customerDelete = await client.query(
    `
      DELETE FROM mdata.customers
      WHERE customer_code = $1
        AND operating_company_id = $2
    `,
    [TEST_CUSTOMER_CODE, operatingCompanyId]
  );
  console.log(`cleanup: deleted customers=${customerDelete.rowCount}`);
}

async function seed() {
  const paymentTermsRes = await client.query(
    `
      SELECT id
      FROM catalogs.payment_terms
      WHERE terms_name ILIKE 'Net 30'
         OR days_until_due = 30
      ORDER BY terms_name ASC
      LIMIT 1
    `
  );
  const paymentTermsId = paymentTermsRes.rows[0]?.id ?? null;

  const customerInsert = await client.query(
    `
      INSERT INTO mdata.customers (
        customer_code,
        customer_name,
        mc_number,
        billing_email,
        payment_terms_id,
        credit_limit,
        detention_rate_per_hour,
        free_time_pickup_minutes,
        factoring_eligible,
        status,
        notes,
        operating_company_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (customer_code) DO NOTHING
      RETURNING id
    `,
    [
      TEST_CUSTOMER_CODE,
      "TEST Broker LLC (auto-seeded)",
      "MC-TEST-001",
      "test-broker@example.invalid",
      paymentTermsId,
      10000,
      50,
      120,
      false,
      "active",
      "AUTO SEEDED TEST FIXTURE: payment terms target = Net 30",
      operatingCompanyId,
    ]
  );
  console.log(`seed: customer inserted=${customerInsert.rowCount}`);

  for (const fixture of DRIVER_FIXTURES) {
    const inserted = await client.query(
      `
        INSERT INTO mdata.drivers (
          first_name,
          last_name,
          email,
          phone,
          cdl_number,
          cdl_state,
          cdl_class,
          cdl_expires_at,
          hire_date,
          pay_basis,
          notes,
          dot_medical_expires_at,
          operating_company_id,
          status
        )
        SELECT
          $1, $2, $3, $4, $5, 'TX', 'A',
          '2030-12-31'::date,
          '2026-01-01'::date,
          'practical_miles',
          'AUTO SEEDED TEST FIXTURE: requested pay_basis=percentage and pay_basis_value=0.25 not available in current schema',
          '2027-12-31'::date,
          $6,
          'Active'
        WHERE NOT EXISTS (
          SELECT 1
          FROM mdata.drivers
          WHERE email = $3
            AND operating_company_id = $6
        )
        RETURNING id
      `,
      [fixture.firstName, fixture.lastName, fixture.email, fixture.phone, fixture.cdlNumber, operatingCompanyId]
    );
    console.log(`seed: driver ${fixture.email} inserted=${inserted.rowCount}`);
  }

  for (const fixture of UNIT_FIXTURES) {
    const inserted = await client.query(
      `
        INSERT INTO mdata.units (
          unit_number,
          vin,
          year,
          make,
          model,
          license_plate,
          license_state,
          owner_company_id,
          status
        )
        VALUES (
          $1, $2, 2024, 'TEST', 'Test Tractor', $3, 'TX', $4, 'InService'
        )
        ON CONFLICT (unit_number) DO NOTHING
        RETURNING id
      `,
      [fixture.unitNumber, fixture.vin, fixture.plate, operatingCompanyId]
    );
    console.log(`seed: unit ${fixture.unitNumber} inserted=${inserted.rowCount}`);
  }

  if (await tableExists("mdata", "trailers")) {
    const trailerInsert = await client.query(
      `
        INSERT INTO mdata.trailers (
          trailer_number,
          vin,
          type,
          operating_company_id
        )
        VALUES (
          $1, $2, $3, $4
        )
        ON CONFLICT (trailer_number) DO NOTHING
        RETURNING id
      `,
      [TEST_TRAILER_NUMBER, "1FUJBBCK5XLA00099", "Dry Van", operatingCompanyId]
    );
    console.log(`seed: trailer inserted=${trailerInsert.rowCount}`);
  } else {
    console.log("seed: skipped trailer seed (mdata.trailers does not exist)");
  }
}

try {
  await client.connect();
  await resolveOperatingCompanyId();
  await client.query("BEGIN");
  if (cleanupMode) {
    console.log("mode=cleanup");
    await cleanup();
  } else {
    console.log("mode=seed");
    await seed();
  }
  await client.query("COMMIT");
  console.log("PASS: db-seed-test-fixtures");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(`FAIL: db-seed-test-fixtures -> ${String(error.message || error)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
