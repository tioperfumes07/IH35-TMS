type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type SampleSeedSummary = {
  customer_id: string;
  vendor_id: string;
  driver_id: string;
  unit_id: string;
  load_id: string;
  created: {
    customer: boolean;
    vendor: boolean;
    driver: boolean;
    unit: boolean;
    load: boolean;
  };
};

async function getColumns(client: Queryable, schema: string, table: string): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [schema, table]
  );
  return new Set(res.rows.map((row) => row.column_name));
}

function toInsertParts(values: Record<string, unknown>, allowed: Set<string>) {
  const entries = Object.entries(values).filter(([key, value]) => allowed.has(key) && value !== undefined);
  const columns = entries.map(([key]) => key);
  const params = entries.map(([, value]) => value);
  const placeholders = entries.map((_, idx) => `$${idx + 1}`);
  return { columns, params, placeholders };
}

async function ensureCustomer(client: Queryable, companyId: string, actorUserId: string, columns: Set<string>) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.customers
      WHERE operating_company_id = $1
        AND customer_name = 'Sample Customer Inc'
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE mdata.customers
        SET is_sample_data = true,
            updated_by_user_id = $2
        WHERE id = $1
      `,
      [existing.rows[0].id, actorUserId]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const insertValues: Record<string, unknown> = {
    customer_name: "Sample Customer Inc",
    customer_type: "shipper",
    status: "active",
    operating_company_id: companyId,
    billing_email: "sample-customer@example.com",
    billing_phone: "+15551234567",
    notes: "Onboarding sample customer record",
    created_by_user_id: actorUserId,
    updated_by_user_id: actorUserId,
    is_sample_data: true,
  };
  const parts = toInsertParts(insertValues, columns);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mdata.customers (${parts.columns.join(", ")}) VALUES (${parts.placeholders.join(", ")}) RETURNING id::text AS id`,
    parts.params
  );
  return { id: inserted.rows[0].id, created: true };
}

async function ensureVendor(client: Queryable, companyId: string, actorUserId: string, columns: Set<string>) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.vendors
      WHERE operating_company_id = $1
        AND vendor_name = 'Sample Vendor Co'
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE mdata.vendors
        SET is_sample_data = true,
            updated_by_user_id = $2
        WHERE id = $1
      `,
      [existing.rows[0].id, actorUserId]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const insertValues: Record<string, unknown> = {
    vendor_name: "Sample Vendor Co",
    vendor_type: "Other",
    operating_company_id: companyId,
    email: "sample-vendor@example.com",
    notes: "Onboarding sample vendor record",
    created_by_user_id: actorUserId,
    updated_by_user_id: actorUserId,
    is_sample_data: true,
  };
  const parts = toInsertParts(insertValues, columns);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mdata.vendors (${parts.columns.join(", ")}) VALUES (${parts.placeholders.join(", ")}) RETURNING id::text AS id`,
    parts.params
  );
  return { id: inserted.rows[0].id, created: true };
}

async function ensureDriver(client: Queryable, companyId: string, actorUserId: string, columns: Set<string>) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1
        AND first_name = 'John'
        AND last_name = 'Tester'
        AND phone = '+15557654321'
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE mdata.drivers
        SET is_sample_data = true,
            updated_by_user_id = $2
        WHERE id = $1
      `,
      [existing.rows[0].id, actorUserId]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const insertValues: Record<string, unknown> = {
    first_name: "John",
    last_name: "Tester",
    phone: "+15557654321",
    email: "john.tester@example.com",
    status: "Active",
    pay_basis: "short_miles",
    operating_company_id: companyId,
    notes: "Onboarding sample driver record",
    created_by_user_id: actorUserId,
    updated_by_user_id: actorUserId,
    is_sample_data: true,
  };
  const parts = toInsertParts(insertValues, columns);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mdata.drivers (${parts.columns.join(", ")}) VALUES (${parts.placeholders.join(", ")}) RETURNING id::text AS id`,
    parts.params
  );
  return { id: inserted.rows[0].id, created: true };
}

async function ensureUnit(
  client: Queryable,
  companyId: string,
  driverId: string,
  actorUserId: string,
  columns: Set<string>
) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.units
      WHERE unit_number = 'TEST-001'
      LIMIT 1
    `
  );
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE mdata.units
        SET is_sample_data = true,
            assigned_driver_id = $2,
            updated_by_user_id = $3
        WHERE id = $1
      `,
      [existing.rows[0].id, driverId, actorUserId]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const insertValues: Record<string, unknown> = {
    unit_number: "TEST-001",
    vin: "VIN-TEST-0001",
    make: "Sample",
    model: "Freightliner",
    year: 2022,
    status: "InService",
    assigned_driver_id: driverId,
    owner_company_id: companyId,
    currently_leased_to_company_id: companyId,
    notes: "Onboarding sample unit",
    created_by_user_id: actorUserId,
    updated_by_user_id: actorUserId,
    is_sample_data: true,
  };
  const parts = toInsertParts(insertValues, columns);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mdata.units (${parts.columns.join(", ")}) VALUES (${parts.placeholders.join(", ")}) RETURNING id::text AS id`,
    parts.params
  );
  return { id: inserted.rows[0].id, created: true };
}

async function ensureLoad(
  client: Queryable,
  companyId: string,
  customerId: string,
  driverId: string,
  unitId: string,
  actorUserId: string,
  columns: Set<string>
) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND load_number = 'LD-SAMPLE-001'
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]) {
    await client.query(
      `
        UPDATE mdata.loads
        SET is_sample_data = true,
            assigned_primary_driver_id = $2,
            assigned_unit_id = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [existing.rows[0].id, driverId, unitId]
    );
    return { id: existing.rows[0].id, created: false };
  }

  const insertValues: Record<string, unknown> = {
    operating_company_id: companyId,
    load_number: "LD-SAMPLE-001",
    customer_id: customerId,
    status: "draft",
    rate_total_cents: 150000,
    currency_code: "USD",
    assigned_unit_id: unitId,
    assigned_primary_driver_id: driverId,
    dispatcher_user_id: actorUserId,
    notes: "Onboarding sample load",
    is_sample_data: true,
  };
  const parts = toInsertParts(insertValues, columns);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO mdata.loads (${parts.columns.join(", ")}) VALUES (${parts.placeholders.join(", ")}) RETURNING id::text AS id`,
    parts.params
  );
  return { id: inserted.rows[0].id, created: true };
}

async function ensureSampleStops(client: Queryable, loadId: string) {
  const existing = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM mdata.load_stops
      WHERE load_id = $1
    `,
    [loadId]
  );
  if (Number(existing.rows[0]?.count ?? "0") > 0) return;

  await client.query(
    `
      INSERT INTO mdata.load_stops (
        load_id,
        sequence_number,
        stop_type,
        address_line1,
        city,
        state,
        country,
        scheduled_arrival_at,
        status
      )
      VALUES
      ($1, 1, 'pickup', '123 Sample Pickup Rd', 'Laredo', 'TX', 'US', now() + interval '1 day', 'pending'),
      ($1, 2, 'delivery', '456 Sample Delivery Ave', 'San Antonio', 'TX', 'US', now() + interval '2 day', 'pending')
    `,
    [loadId]
  );
}

export async function seedSampleData(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string }
): Promise<SampleSeedSummary> {
  await client.query("BEGIN");
  try {
    const customerColumns = await getColumns(client, "mdata", "customers");
    const vendorColumns = await getColumns(client, "mdata", "vendors");
    const driverColumns = await getColumns(client, "mdata", "drivers");
    const unitColumns = await getColumns(client, "mdata", "units");
    const loadColumns = await getColumns(client, "mdata", "loads");

    const customer = await ensureCustomer(client, input.operatingCompanyId, input.actorUserId, customerColumns);
    const vendor = await ensureVendor(client, input.operatingCompanyId, input.actorUserId, vendorColumns);
    const driver = await ensureDriver(client, input.operatingCompanyId, input.actorUserId, driverColumns);
    const unit = await ensureUnit(client, input.operatingCompanyId, driver.id, input.actorUserId, unitColumns);
    const load = await ensureLoad(
      client,
      input.operatingCompanyId,
      customer.id,
      driver.id,
      unit.id,
      input.actorUserId,
      loadColumns
    );
    await ensureSampleStops(client, load.id);

    await client.query("COMMIT");
    return {
      customer_id: customer.id,
      vendor_id: vendor.id,
      driver_id: driver.id,
      unit_id: unit.id,
      load_id: load.id,
      created: {
        customer: customer.created,
        vendor: vendor.created,
        driver: driver.created,
        unit: unit.created,
        load: load.created,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
