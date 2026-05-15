import pg from "pg";

export type SeedType = "drivers" | "customers" | "vendors" | "assets" | "loads" | "bank_accounts" | "bank_transactions";
export type CompanyCode = "TRK" | "TRANSP";

const DRIVER_HEADERS = ["first_name", "last_name", "email", "phone", "cdl_number", "cdl_state", "cdl_class", "cdl_expires_at", "hire_date", "status"];
const CUSTOMER_HEADERS = ["customer_code", "customer_name", "billing_email", "billing_phone", "mc_number", "dot_number", "billing_address_line1", "billing_city", "billing_state", "billing_postal_code"];
const VENDOR_HEADERS = ["vendor_code", "vendor_name", "vendor_type", "phone", "email", "tax_id", "address_line1", "city", "state", "postal_code", "notes"];
const ASSET_HEADERS = ["asset_kind", "unit_number", "vin", "year", "make", "model", "equipment_type", "license_plate", "license_state", "notes"];
const LOAD_HEADERS = [
  "company_code",
  "load_number",
  "customer_code",
  "rate_total_cents",
  "status",
  "currency_code",
  "dispatcher_email",
  "assigned_unit_number",
  "primary_driver_cdl",
  "secondary_driver_cdl",
  "pickup_scheduled_arrival_at",
  "pickup_city",
  "pickup_state",
  "pickup_country",
  "delivery_scheduled_arrival_at",
  "delivery_city",
  "delivery_state",
  "delivery_country",
  "notes",
];
const BANK_ACCOUNT_HEADERS = [
  "company_code",
  "plaid_account_id",
  "institution_name",
  "account_name",
  "account_type",
  "account_mask",
  "current_balance_cents",
  "available_balance_cents",
  "currency_code",
  "plaid_item_id",
  "sync_status",
];
const BANK_TRANSACTION_HEADERS = [
  "company_code",
  "plaid_transaction_id",
  "plaid_account_id",
  "transaction_date",
  "posted_date",
  "amount_cents",
  "description",
  "merchant_name",
  "pending",
  "is_credit",
  "matched_load_number",
];

function csvSplitLines(contents: string): string[][] {
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) =>
    line.split(",").map((cell) =>
      cell
        .replace(/^\ufeff/, "")
        .trim()
    )
  );
}

function assertHeaders(found: string[], expected: readonly string[], label: string) {
  const missing = expected.filter((required) => !found.includes(required));
  if (missing.length > 0) {
    throw new Error(`${label} CSV missing columns: ${missing.join(", ")}`);
  }
}

function nonempty(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("Required value missing");
  return text;
}

function nullable(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length ? text : null;
}

function parseDateMaybe(value: string | null): string | null {
  if (!value) return null;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) throw new Error(`Invalid ISO date "${value}"`);
  return value;
}

function deriveCodeSlug(prefix: string, source: string) {
  const slug = source
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return slug.length ? `${prefix}-${slug}` : `${prefix}-unnamed`;
}

function parseCompany(value: string): CompanyCode {
  const upper = value.trim().toUpperCase();
  if (upper !== "TRK" && upper !== "TRANSP") throw new Error(`Unsupported --company "${value}". Use TRK or TRANSP.`);
  return upper as CompanyCode;
}

function parseType(value: string): SeedType {
  const lowered = value.trim().toLowerCase();
  if (lowered === "drivers") return "drivers";
  if (lowered === "customers") return "customers";
  if (lowered === "vendors") return "vendors";
  if (lowered === "assets") return "assets";
  if (lowered === "loads") return "loads";
  if (lowered === "bank_accounts" || lowered === "bank-accounts") return "bank_accounts";
  if (lowered === "bank_transactions" || lowered === "bank-transactions") return "bank_transactions";
  throw new Error(
    `Unsupported --type "${value}". Expected drivers | customers | vendors | assets | loads | bank_accounts | bank_transactions`
  );
}

function parseCompanyMaybe(value: string | undefined): CompanyCode | undefined {
  if (!value) return undefined;
  return parseCompany(value);
}

const ROW_SCOPED_TYPES = new Set<SeedType>(["loads", "bank_accounts", "bank_transactions"]);

function parseBoolLoose(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== "string") return defaultValue;
  const t = value.trim().toLowerCase();
  if (!t) return defaultValue;
  if (["1", "true", "yes", "y"].includes(t)) return true;
  if (["0", "false", "no", "n"].includes(t)) return false;
  throw new Error(`Invalid boolean "${value}"`);
}

function parseIsoDateTimeMaybe(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) throw new Error(`Invalid ISO timestamp "${raw}"`);
  return raw;
}

const LOAD_STATUSES = new Set([
  "draft",
  "booked",
  "planned",
  "assigned",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
]);

async function resolveCompanyId(client: pg.Client, code: CompanyCode) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM org.companies
      WHERE code = $1
      LIMIT 1
    `,
    [code]
  );
  const row = res.rows[0] ?? null;
  if (!row) throw new Error(`Company "${code}" not found in org.companies`);
  return row.id;
}

async function driverExists(client: pg.Client, companyId: string, cdlNumber: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.drivers
      WHERE operating_company_id = $1
        AND cdl_number = $2
      LIMIT 1
    `,
    [companyId, cdlNumber.trim()]
  );
  return Boolean(res.rows[0]);
}

async function customerExists(client: pg.Client, companyId: string, customerCode: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.customers
      WHERE operating_company_id = $1
        AND lower(customer_code) = lower($2)
      LIMIT 1
    `,
    [companyId, customerCode.trim()]
  );
  return Boolean(res.rows[0]);
}

async function vendorExists(client: pg.Client, companyId: string, vendorCode: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.vendors
      WHERE operating_company_id = $1
        AND lower(vendor_code) = lower($2)
      LIMIT 1
    `,
    [companyId, vendorCode.trim()]
  );
  return Boolean(res.rows[0]);
}

async function unitExists(client: pg.Client, unitNumber: string) {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM mdata.units WHERE unit_number = $1 LIMIT 1`,
    [unitNumber.trim()]
  );
  return Boolean(res.rows[0]);
}

async function equipmentExists(client: pg.Client, equipmentNumber: string) {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM mdata.equipment WHERE equipment_number = $1 LIMIT 1`,
    [equipmentNumber.trim()]
  );
  return Boolean(res.rows[0]);
}

async function loadExists(client: pg.Client, operatingCompanyId: string, loadNumber: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.loads
      WHERE operating_company_id = $1 AND load_number = $2 AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadNumber.trim()]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveCustomerIdForCompany(client: pg.Client, operatingCompanyId: string, customerCode: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.customers
      WHERE operating_company_id = $1 AND lower(customer_code) = lower($2)
      LIMIT 1
    `,
    [operatingCompanyId, customerCode.trim()]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveDispatcherUserId(client: pg.Client, operatingCompanyId: string, dispatcherEmailRaw: string | null) {
  const dispatcherEmail = dispatcherEmailRaw?.trim() ?? "";
  if (dispatcherEmail) {
    const res = await client.query<{ id: string }>(
      `
        SELECT u.id
        FROM identity.users u
        JOIN org.user_company_access uca
          ON uca.user_id = u.id
         AND uca.company_id = $1
         AND uca.deactivated_at IS NULL
        WHERE u.deactivated_at IS NULL
          AND lower(u.email) = lower($2)
        LIMIT 1
      `,
      [operatingCompanyId, dispatcherEmail]
    );
    return res.rows[0]?.id ?? null;
  }

  const fallback = await client.query<{ id: string }>(
    `
      SELECT u.id
      FROM identity.users u
      JOIN org.user_company_access uca
        ON uca.user_id = u.id
       AND uca.company_id = $1
       AND uca.deactivated_at IS NULL
      WHERE u.deactivated_at IS NULL
      ORDER BY u.created_at ASC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  return fallback.rows[0]?.id ?? null;
}

async function resolveDriverIdByCdl(client: pg.Client, operatingCompanyId: string, cdlNumberRaw: string | null) {
  const cdlNumber = cdlNumberRaw?.trim() ?? "";
  if (!cdlNumber) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.drivers
      WHERE operating_company_id = $1 AND cdl_number = $2 AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, cdlNumber]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveUnitIdByNumber(client: pg.Client, unitNumberRaw: string | null) {
  const unitNumber = unitNumberRaw?.trim() ?? "";
  if (!unitNumber) return null;
  const res = await client.query<{ id: string }>(
    `SELECT id FROM mdata.units WHERE unit_number = $1 LIMIT 1`,
    [unitNumber]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveLoadIdByNumber(client: pg.Client, operatingCompanyId: string, loadNumber: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.loads
      WHERE operating_company_id = $1 AND load_number = $2 AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, loadNumber.trim()]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveBankAccountId(
  client: pg.Client,
  operatingCompanyId: string,
  plaidAccountId: string | null,
  institutionName: string | null,
  accountMask: string | null
) {
  if (plaidAccountId && plaidAccountId.trim()) {
    const res = await client.query<{ id: string }>(
      `
        SELECT id
        FROM banking.bank_accounts
        WHERE operating_company_id = $1 AND plaid_account_id = $2
        LIMIT 1
      `,
      [operatingCompanyId, plaidAccountId.trim()]
    );
    return res.rows[0]?.id ?? null;
  }
  if (institutionName?.trim() && accountMask?.trim()) {
    const res = await client.query<{ id: string }>(
      `
        SELECT id
        FROM banking.bank_accounts
        WHERE operating_company_id = $1
          AND institution_name = $2
          AND account_mask = $3
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, institutionName.trim(), accountMask.trim()]
    );
    return res.rows[0]?.id ?? null;
  }
  return null;
}

async function bankTransactionExists(client: pg.Client, plaidTransactionId: string) {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM banking.bank_transactions WHERE plaid_transaction_id = $1 LIMIT 1`,
    [plaidTransactionId.trim()]
  );
  return Boolean(res.rows[0]);
}

type RowReport = {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

function finalizeSeedTxn(client: pg.Client, dryRun: boolean, abortOnAnyError: boolean, errorCount: number) {
  const rollback = dryRun || (!dryRun && abortOnAnyError && errorCount > 0);
  return client.query(rollback ? "ROLLBACK" : "COMMIT");
}

type TxnMode = "isolated" | "participant";

export class CsvImportRowErrors extends Error {
  readonly errors: Array<{ row: number; message: string }>;
  constructor(errors: Array<{ row: number; message: string }>) {
    super("One or more rows failed.");
    this.name = "CsvImportRowErrors";
    this.errors = errors;
  }
}

async function beginSeedTxn(client: pg.Client, txnMode: TxnMode): Promise<void> {
  if (txnMode === "isolated") {
    await client.query("BEGIN");
  }
}

async function endSeedTxn(
  client: pg.Client,
  txnMode: TxnMode,
  dryRun: boolean,
  abortOnAnyError: boolean,
  counters: RowReport
): Promise<void> {
  if (txnMode === "participant") {
    if (abortOnAnyError && counters.errors.length > 0) {
      throw new CsvImportRowErrors(counters.errors);
    }
    return;
  }
  await finalizeSeedTxn(client, dryRun, abortOnAnyError, counters.errors.length);
}

async function upsertDrivers(
  client: pg.Client,
  companyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };

  await beginSeedTxn(client, txnMode);

  try {
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];

      await client.query("SAVEPOINT seed_row_driver");

      try {
        const cdlNumber = nonempty(row.cdl_number);
        const existsAlready = await driverExists(client, companyId, cdlNumber);
        if (existsAlready) {
          counters.skipped += 1;
          await client.query("RELEASE SAVEPOINT seed_row_driver");
          continue;
        }

        const statusUpper = nonempty(row.status);
        const statuses = ["Active", "Probation", "Inactive", "Terminated", "OnLeave"];
        if (!statuses.includes(statusUpper)) {
          throw new Error(`Invalid driver status "${row.status}".`);
        }

        const cdlClass = nullable(row.cdl_class)?.toUpperCase() ?? null;
        if (cdlClass && !["A", "B", "C"].includes(cdlClass)) {
          throw new Error(`Invalid CDL class "${cdlClass}"`);
        }

        if (!dryRun) {
          await client.query(
            `
              INSERT INTO mdata.drivers (
                first_name,
                last_name,
                phone,
                email,
                cdl_number,
                cdl_state,
                cdl_class,
                cdl_expires_at,
                hire_date,
                status,
                operating_company_id
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::mdata.driver_status,$11
              )
            `,
            [
              nonempty(row.first_name),
              nonempty(row.last_name),
              nonempty(row.phone),
              nullable(row.email),
              cdlNumber,
              nullable(row.cdl_state),
              cdlClass,
              parseDateMaybe(nullable(row.cdl_expires_at)),
              parseDateMaybe(nullable(row.hire_date)),
              statusUpper,
              companyId,
            ]
          );
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_driver");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_driver");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }

    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

async function upsertCustomers(
  client: pg.Client,
  companyId: string,
  companyPrefix: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);
  try {
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];

      await client.query("SAVEPOINT seed_row_customer");

      try {
        const declaredCode = nullable(row.customer_code)?.trim().toUpperCase();
        let customerCode = declaredCode ?? deriveCodeSlug(companyPrefix, nonempty(row.customer_name)).toUpperCase();

        let attempts = 0;
        while (await customerExists(client, companyId, `${customerCode}`)) {
          if (declaredCode) {
            counters.skipped += 1;
            attempts = Number.POSITIVE_INFINITY;
            break;
          }
          attempts += 1;
          customerCode = `${deriveCodeSlug(companyPrefix, `${row.customer_name}-${attempts}`).toUpperCase()}`;
          if (attempts > 12) throw new Error("Unable to synthesize unique customer_code");
        }
        if (attempts === Number.POSITIVE_INFINITY) {
          await client.query("RELEASE SAVEPOINT seed_row_customer");
          continue;
        }

        if (!dryRun) {
          await client.query(
            `
              INSERT INTO mdata.customers (
                operating_company_id,
                customer_code,
                customer_name,
                billing_email,
                billing_phone,
                mc_number,
                dot_number,
                billing_address_line1,
                billing_city,
                billing_state,
                billing_postal_code
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            `,
            [
              companyId,
              customerCode,
              nonempty(row.customer_name),
              nullable(row.billing_email),
              nullable(row.billing_phone),
              nullable(row.mc_number),
              nullable(row.dot_number),
              nullable(row.billing_address_line1),
              nonempty(row.billing_city),
              nonempty(row.billing_state),
              nonempty(row.billing_postal_code),
            ]
          );
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_customer");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_customer");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return counters;
}

async function upsertVendors(
  client: pg.Client,
  companyId: string,
  companyPrefix: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const allowedTypes = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"];
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);
  try {
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];
      await client.query("SAVEPOINT seed_row_vendor");
      try {
        const vendorTypeCandidate = nonempty(row.vendor_type).trim();
        const vendorTypeFinal = `${vendorTypeCandidate[0]?.toUpperCase() ?? ""}${vendorTypeCandidate.slice(1)}`;
        if (!allowedTypes.includes(vendorTypeFinal)) {
          throw new Error(`Invalid vendor_type "${row.vendor_type}"`);
        }
        const declaredCode = nullable(row.vendor_code)?.trim().toUpperCase();
        let vendorCode = declaredCode ?? deriveCodeSlug(companyPrefix, nonempty(row.vendor_name)).toUpperCase();
        let attempts = 0;
        while (await vendorExists(client, companyId, vendorCode)) {
          if (declaredCode) {
            counters.skipped += 1;
            attempts = Number.POSITIVE_INFINITY;
            break;
          }
          attempts += 1;
          vendorCode = `${deriveCodeSlug(companyPrefix, `${row.vendor_name}-${attempts}`).toUpperCase()}`;
          if (attempts > 25) throw new Error("Unable to synthesize unique vendor_code");
        }
        if (attempts === Number.POSITIVE_INFINITY) {
          await client.query("RELEASE SAVEPOINT seed_row_vendor");
          continue;
        }
        if (!dryRun) {
          await client.query(
            `
              INSERT INTO mdata.vendors (
                operating_company_id,
                vendor_code,
                vendor_name,
                vendor_type,
                phone,
                email,
                tax_id,
                address_line1,
                city,
                state,
                postal_code,
                notes,
                country
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'US')
            `,
            [
              companyId,
              vendorCode,
              nonempty(row.vendor_name),
              vendorTypeFinal,
              nullable(row.phone),
              nullable(row.email),
              nullable(row.tax_id),
              nullable(row.address_line1),
              nonempty(row.city),
              nonempty(row.state),
              nonempty(row.postal_code),
              nullable(row.notes),
            ]
          );
        }
        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_vendor");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_vendor");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return counters;
}

const EQUIPMENT_KINDS = new Set(["DryVan", "Reefer", "Flatbed", "Tanker", "Container", "Chassis", "StepDeck", "Lowboy"]);

async function upsertAssets(
  client: pg.Client,
  companyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);

  try {
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];

      await client.query("SAVEPOINT seed_row_assets");

      try {
        const kind = nonempty(row.asset_kind).trim();
        const unitNumber = nonempty(row.unit_number);
        const yearValue = nullable(row.year);
        const yearParsed = yearValue ? Number.parseInt(yearValue, 10) : null;

        if (kind.toLowerCase() === "truck") {
          const existsAlready = await unitExists(client, unitNumber);
          if (existsAlready) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_assets");
            continue;
          }
          const vin = nonempty(row.vin);
          const make = nonempty(row.make);
          const model = nonempty(row.model);
          if (!yearParsed || Number.isNaN(yearParsed)) throw new Error("Truck requires numeric year.");
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO mdata.units (
                  unit_number,
                  vin,
                  make,
                  model,
                  year,
                  license_plate,
                  license_state,
                  owner_company_id,
                  currently_leased_to_company_id,
                  notes,
                  status
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10::text::mdata.unit_status)
              `,
              [
                unitNumber,
                vin,
                make,
                model,
                yearParsed,
                nullable(row.license_plate),
                nullable(row.license_state),
                companyId,
                nullable(row.notes),
                "InService",
              ]
            );
          }
        } else if (kind.toLowerCase() === "trailer") {
          const trailerNumber = unitNumber.trim();
          const existsAlready = await equipmentExists(client, trailerNumber);
          if (existsAlready) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_assets");
            continue;
          }
          const equipmentType = nonempty(row.equipment_type).trim();
          if (!EQUIPMENT_KINDS.has(equipmentType)) throw new Error(`Unsupported equipment_type "${equipmentType}".`);
          const vin = nullable(row.vin);
          if (!yearParsed || Number.isNaN(yearParsed)) throw new Error("Trailer rows require numeric year for placeholder cataloguing.");
          if (!dryRun) {
            await client.query(
              `
                INSERT INTO mdata.equipment (
                  equipment_number,
                  vin,
                  equipment_type,
                  make,
                  model,
                  year,
                  license_plate,
                  license_state,
                  notes,
                  status,
                  owner_company_id,
                  currently_leased_to_company_id
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::mdata.equipment_status,$11,NULL)
              `,
              [
                trailerNumber,
                vin,
                equipmentType,
                nullable(row.make),
                nullable(row.model),
                yearParsed,
                nullable(row.license_plate),
                nullable(row.license_state),
                nullable(row.notes),
                "InService",
                companyId,
              ]
            );
          }
        } else {
          throw new Error(`Unknown asset_kind "${row.asset_kind}" (expect Truck | Trailer)`);
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_assets");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_assets");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

async function upsertLoads(
  client: pg.Client,
  operatingCompanyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);
  try {
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];
      await client.query("SAVEPOINT seed_row_load");
      try {
        const loadNumber = nonempty(row.load_number);
        const existingId = await loadExists(client, operatingCompanyId, loadNumber);
        if (existingId) {
          counters.skipped += 1;
          await client.query("RELEASE SAVEPOINT seed_row_load");
          continue;
        }

        const customerId = await resolveCustomerIdForCompany(client, operatingCompanyId, nonempty(row.customer_code));
        if (!customerId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_load");
            continue;
          }
          throw new Error(`customer_code "${row.customer_code}" not found for company`);
        }

        const dispatcherId = await resolveDispatcherUserId(client, operatingCompanyId, nullable(row.dispatcher_email));
        if (!dispatcherId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_load");
            continue;
          }
          throw new Error(`dispatcher not found (email="${row.dispatcher_email ?? ""}" or company access fallback)`);
        }

        const primaryDriverId = await resolveDriverIdByCdl(client, operatingCompanyId, nullable(row.primary_driver_cdl));
        if (nullable(row.primary_driver_cdl)?.trim() && !primaryDriverId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_load");
            continue;
          }
          throw new Error(`primary_driver_cdl "${row.primary_driver_cdl}" not found`);
        }

        const secondaryDriverId = await resolveDriverIdByCdl(client, operatingCompanyId, nullable(row.secondary_driver_cdl));
        if (nullable(row.secondary_driver_cdl)?.trim() && !secondaryDriverId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_load");
            continue;
          }
          throw new Error(`secondary_driver_cdl "${row.secondary_driver_cdl}" not found`);
        }

        const unitId = await resolveUnitIdByNumber(client, nullable(row.assigned_unit_number));
        if (nullable(row.assigned_unit_number)?.trim() && !unitId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_load");
            continue;
          }
          throw new Error(`assigned_unit_number "${row.assigned_unit_number}" not found`);
        }

        const rateRaw = nonempty(row.rate_total_cents);
        if (!/^[0-9]+$/.test(rateRaw)) throw new Error(`rate_total_cents must be a non-negative integer string, got "${rateRaw}"`);
        const rateParsed = Number.parseInt(rateRaw, 10);
        if (!Number.isFinite(rateParsed) || rateParsed < 0) throw new Error(`Invalid rate_total_cents "${rateRaw}"`);

        const statusRaw = (nullable(row.status)?.trim().toLowerCase() ?? "booked") || "booked";
        if (!LOAD_STATUSES.has(statusRaw)) throw new Error(`Invalid load status "${row.status}"`);

        const currencyCode = (nullable(row.currency_code)?.trim().toUpperCase() ?? "USD") || "USD";
        if (currencyCode !== "USD" && currencyCode !== "MXN") throw new Error(`Invalid currency_code "${currencyCode}"`);

        const pickupTs = parseIsoDateTimeMaybe(row.pickup_scheduled_arrival_at);
        const deliveryTs = parseIsoDateTimeMaybe(row.delivery_scheduled_arrival_at);
        const pickupCity = nullable(row.pickup_city);
        const pickupState = nullable(row.pickup_state);
        const pickupCountry = nullable(row.pickup_country)?.trim().toUpperCase() ?? "US";
        const deliveryCity = nullable(row.delivery_city);
        const deliveryState = nullable(row.delivery_state);
        const deliveryCountry = nullable(row.delivery_country)?.trim().toUpperCase() ?? "US";

        const hasPickupStop = Boolean(pickupTs || pickupCity || pickupState);
        const hasDeliveryStop = Boolean(deliveryTs || deliveryCity || deliveryState);

        if (!dryRun) {
          const inserted = await client.query<{ id: string }>(
            `
              INSERT INTO mdata.loads (
                operating_company_id,
                load_number,
                customer_id,
                status,
                rate_total_cents,
                currency_code,
                assigned_unit_id,
                assigned_primary_driver_id,
                assigned_secondary_driver_id,
                dispatcher_user_id,
                notes
              )
              VALUES (
                $1,$2,$3,$4::mdata.load_status_enum,$5::bigint,$6,$7,$8,$9,$10,$11
              )
              RETURNING id
            `,
            [
              operatingCompanyId,
              loadNumber,
              customerId,
              statusRaw,
              rateParsed,
              currencyCode,
              unitId,
              primaryDriverId,
              secondaryDriverId,
              dispatcherId,
              nullable(row.notes),
            ]
          );
          const loadId = inserted.rows[0]?.id;
          if (!loadId) throw new Error("Load insert failed");

          let seq = 1;
          if (hasPickupStop) {
            await client.query(
              `
                INSERT INTO mdata.load_stops (
                  load_id,
                  sequence_number,
                  stop_type,
                  city,
                  state,
                  country,
                  scheduled_arrival_at,
                  status
                )
                VALUES ($1, $2, 'pickup'::mdata.stop_type_enum, $3, $4, $5, $6::timestamptz, 'pending'::mdata.stop_status_enum)
              `,
              [loadId, seq, pickupCity, pickupState, pickupCountry, pickupTs]
            );
            seq += 1;
          }
          if (hasDeliveryStop) {
            await client.query(
              `
                INSERT INTO mdata.load_stops (
                  load_id,
                  sequence_number,
                  stop_type,
                  city,
                  state,
                  country,
                  scheduled_arrival_at,
                  status
                )
                VALUES ($1, $2, 'delivery'::mdata.stop_type_enum, $3, $4, $5, $6::timestamptz, 'pending'::mdata.stop_status_enum)
              `,
              [loadId, seq, deliveryCity, deliveryState, deliveryCountry, deliveryTs]
            );
          }
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_load");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_load");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

async function upsertBankAccounts(
  client: pg.Client,
  operatingCompanyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const allowedSync = new Set(["pending", "active", "disconnected", "needs_reauth", "error"]);
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);
  try {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];
      await client.query("SAVEPOINT seed_row_bank_account");
      try {
        const plaidAccountId = nullable(row.plaid_account_id);
        const institutionName = nullable(row.institution_name);
        const accountMask = nullable(row.account_mask);
        if (!institutionName || !accountMask) {
          throw new Error("institution_name and account_mask are required");
        }

        const existingId = await resolveBankAccountId(client, operatingCompanyId, plaidAccountId, institutionName, accountMask);
        if (existingId) {
          counters.skipped += 1;
          await client.query("RELEASE SAVEPOINT seed_row_bank_account");
          continue;
        }

        const currentBalRaw = nonempty(row.current_balance_cents);
        const availableBalRaw = nonempty(row.available_balance_cents);
        if (!/^-?[0-9]+$/.test(currentBalRaw)) throw new Error(`Invalid current_balance_cents "${currentBalRaw}"`);
        if (!/^-?[0-9]+$/.test(availableBalRaw)) throw new Error(`Invalid available_balance_cents "${availableBalRaw}"`);
        const currentBal = Number.parseInt(currentBalRaw, 10);
        const availableBal = Number.parseInt(availableBalRaw, 10);
        if (!Number.isFinite(currentBal) || !Number.isFinite(availableBal)) throw new Error("Invalid balance cents");

        const currency = (nullable(row.currency_code)?.trim().toUpperCase() ?? "USD") || "USD";
        if (currency.length !== 3) throw new Error(`currency_code must be 3 letters, got "${currency}"`);

        const syncStatus = (nullable(row.sync_status)?.trim().toLowerCase() ?? "pending") || "pending";
        if (!allowedSync.has(syncStatus)) throw new Error(`Invalid sync_status "${row.sync_status}"`);

        if (!dryRun) {
          await client.query(
            `
              INSERT INTO banking.bank_accounts (
                operating_company_id,
                plaid_item_id,
                plaid_account_id,
                institution_name,
                account_name,
                account_type,
                account_mask,
                current_balance_cents,
                available_balance_cents,
                currency_code,
                sync_status,
                is_active
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::bigint,$10,$11,true)
            `,
            [
              operatingCompanyId,
              nullable(row.plaid_item_id),
              plaidAccountId,
              institutionName,
              nonempty(row.account_name),
              nonempty(row.account_type),
              accountMask,
              currentBal,
              availableBal,
              currency,
              syncStatus,
            ]
          );
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_bank_account");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_bank_account");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

async function upsertBankTransactions(
  client: pg.Client,
  operatingCompanyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean,
  abortOnAnyError = false,
  txnMode: TxnMode = "isolated"
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await beginSeedTxn(client, txnMode);
  try {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    for (let idx = 0; idx < parsedRows.length; idx += 1) {
      const rowNumber = idx + 2;
      const row = parsedRows[idx];
      await client.query("SAVEPOINT seed_row_bank_tx");
      try {
        const plaidTxnId = nonempty(row.plaid_transaction_id);
        const existsAlready = await bankTransactionExists(client, plaidTxnId);
        if (existsAlready) {
          counters.skipped += 1;
          await client.query("RELEASE SAVEPOINT seed_row_bank_tx");
          continue;
        }

        const plaidAccountId = nonempty(row.plaid_account_id);
        const bankAccountId = await resolveBankAccountId(client, operatingCompanyId, plaidAccountId, null, null);
        if (!bankAccountId) {
          if (dryRun) {
            counters.skipped += 1;
            await client.query("RELEASE SAVEPOINT seed_row_bank_tx");
            continue;
          }
          throw new Error(`plaid_account_id "${plaidAccountId}" not found for company`);
        }

        const txnDate = nonempty(row.transaction_date);
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(txnDate)) throw new Error(`Invalid transaction_date "${txnDate}"`);
        const postedDate = parseDateMaybe(nullable(row.posted_date));

        const amountRaw = nonempty(row.amount_cents);
        if (!/^-?[0-9]+$/.test(amountRaw)) throw new Error(`Invalid amount_cents "${amountRaw}"`);
        const amountParsed = Number.parseInt(amountRaw, 10);
        if (!Number.isFinite(amountParsed)) throw new Error(`Invalid amount_cents "${amountRaw}"`);

        const pending = parseBoolLoose(row.pending, false);
        const isCredit = parseBoolLoose(row.is_credit, false);

        let matchedLoadId: string | null = null;
        const matchedLoadNumber = nullable(row.matched_load_number)?.trim() ?? "";
        if (matchedLoadNumber) {
          matchedLoadId = await resolveLoadIdByNumber(client, operatingCompanyId, matchedLoadNumber);
          if (!matchedLoadId) {
            throw new Error(`matched_load_number "${matchedLoadNumber}" not found for company`);
          }
        }

        if (!dryRun) {
          await client.query(
            `
              INSERT INTO banking.bank_transactions (
                bank_account_id,
                operating_company_id,
                plaid_transaction_id,
                transaction_date,
                posted_date,
                amount_cents,
                description,
                merchant_name,
                pending,
                is_credit,
                matched_load_id,
                status
              )
              VALUES (
                $1,$2,$3,$4::date,$5::date,$6::bigint,$7,$8,$9,$10,$11,'pending_categorization'
              )
            `,
            [
              bankAccountId,
              operatingCompanyId,
              plaidTxnId,
              txnDate,
              postedDate,
              amountParsed,
              nullable(row.description),
              nullable(row.merchant_name),
              pending,
              isCredit,
              matchedLoadId,
            ]
          );
        }

        counters.inserted += 1;
        await client.query("RELEASE SAVEPOINT seed_row_bank_tx");
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT seed_row_bank_tx");
        counters.errors.push({ row: rowNumber, message: (err as Error).message ?? String(err) });
      }
    }
    await endSeedTxn(client, txnMode, dryRun, abortOnAnyError, counters);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

export type AdminImportEntitySlug =
  | "drivers"
  | "units"
  | "customers"
  | "vendors"
  | "bank-accounts"
  | "loads"
  | "bank-transactions";

export const ADMIN_IMPORT_ENTITY_SLUGS: AdminImportEntitySlug[] = [
  "drivers",
  "units",
  "customers",
  "vendors",
  "bank-accounts",
  "loads",
  "bank-transactions",
];

export function mapAdminImportEntityToSeedType(slug: string): SeedType {
  const t = slug.trim().toLowerCase();
  if (t === "units") return "assets";
  return parseType(t);
}

export type AdminImportPreviewResult = {
  valid_rows: number;
  invalid_rows: number;
  errors: Array<{ row: number; message: string }>;
  sample_valid: Record<string, string>[];
  all_invalid: Array<{ row: number; row_data: Record<string, string>; errors: string[] }>;
};

export type AdminImportCommitResult = {
  inserted_rows: number;
  skipped_rows: number;
  errors: Array<{ row: number; message: string }>;
};

function adminAssertHeaders(seedKind: SeedType, headerRow: string[]) {
  switch (seedKind) {
    case "drivers":
      assertHeaders(headerRow, DRIVER_HEADERS, "drivers");
      break;
    case "customers":
      assertHeaders(headerRow, CUSTOMER_HEADERS, "customers");
      break;
    case "vendors":
      assertHeaders(headerRow, VENDOR_HEADERS, "vendors");
      break;
    case "assets":
      assertHeaders(headerRow, ASSET_HEADERS, "assets");
      break;
    case "loads":
      assertHeaders(headerRow, LOAD_HEADERS, "loads");
      break;
    case "bank_accounts":
      assertHeaders(headerRow, BANK_ACCOUNT_HEADERS, "bank_accounts");
      break;
    case "bank_transactions":
      assertHeaders(headerRow, BANK_TRANSACTION_HEADERS, "bank_transactions");
      break;
    default:
      throw new Error("Unsupported seed type for admin import");
  }
}

function adminSerializeRows(csvRowsRaw: string[][], headerRow: string[]): Record<string, string>[] {
  return csvRowsRaw
    .slice(1)
    .filter((row) => row.length && row[0] && !String(row[0]).trim().startsWith("#"))
    .map((row) => {
      const record: Record<string, string> = {};
      headerRow.forEach((header, idx) => {
        record[header] = row[idx] ?? "";
      });
      return record;
    });
}

function adminGroupRowsByCompany(
  rows: Record<string, string>[],
  codeField: "company_code"
): Map<CompanyCode, Record<string, string>[]> {
  const map = new Map<CompanyCode, Record<string, string>[]>();
  for (const row of rows) {
    const code = parseCompany(nonempty(row[codeField]));
    const bucket = map.get(code) ?? [];
    bucket.push(row);
    map.set(code, bucket);
  }
  return map;
}

function formatAdminPreview(merged: RowReport, serializedRows: Record<string, string>[]): AdminImportPreviewResult {
  const errByRow = new Map<number, string[]>();
  for (const e of merged.errors) {
    const list = errByRow.get(e.row) ?? [];
    list.push(e.message);
    errByRow.set(e.row, list);
  }
  const all_invalid = [...errByRow.entries()]
    .map(([row, errs]) => ({
      row,
      row_data: serializedRows[row - 2] ?? {},
      errors: errs,
    }))
    .sort((a, b) => a.row - b.row);
  const validFull = serializedRows.filter((_, i) => !errByRow.has(i + 2));
  const sample_valid = validFull.slice(0, 5);
  return {
    valid_rows: validFull.length,
    invalid_rows: errByRow.size,
    errors: merged.errors,
    sample_valid,
    all_invalid,
  };
}

export async function runAdminCsvImport(
  client: pg.Client,
  options: {
    csvText: string;
    seedKind: SeedType;
    companyCode?: CompanyCode;
    preview: boolean;
  }
): Promise<AdminImportPreviewResult | AdminImportCommitResult> {
  const { csvText, seedKind, preview } = options;
  const optionalCompanyFilter = options.companyCode;

  const companyRequired = new Set<SeedType>(["drivers", "customers", "vendors", "assets"]);
  if (companyRequired.has(seedKind) && !optionalCompanyFilter) {
    throw new Error("company_code is required for this entity type");
  }

  if (!ROW_SCOPED_TYPES.has(seedKind) && !optionalCompanyFilter) {
    throw new Error("company_code is required for this entity type");
  }

  const csvRowsRaw = csvSplitLines(csvText);
  if (!csvRowsRaw.length) throw new Error("CSV is empty.");
  const headerRow = (csvRowsRaw[0] ?? []).map((h) => h.trim());
  adminAssertHeaders(seedKind, headerRow);

  const serializedRows = adminSerializeRows(csvRowsRaw, headerRow);

  let targets: Map<CompanyCode, Record<string, string>[]>;
  if (ROW_SCOPED_TYPES.has(seedKind)) {
    const filtered = optionalCompanyFilter
      ? serializedRows.filter((row) => parseCompany(nonempty(row.company_code)) === optionalCompanyFilter)
      : serializedRows;
    if (filtered.length === 0) {
      throw new Error("No rows remain after applying company filter.");
    }
    targets = adminGroupRowsByCompany(filtered, "company_code");
  } else {
    targets = new Map([[optionalCompanyFilter!, serializedRows]]);
  }

  async function executeMerge(dryRun: boolean, txnMode: TxnMode): Promise<RowReport> {
    const mergedReport: RowReport = { inserted: 0, skipped: 0, errors: [] };
    const abortOnAnyError = txnMode === "participant";
    for (const [companyCode, rows] of targets.entries()) {
      const operatingCompanyId = await resolveCompanyId(client, companyCode);
      const companySlug = companyCode === "TRK" ? "TRK" : "TRANSP";
      let report: RowReport;
      switch (seedKind) {
        case "drivers":
          report = await upsertDrivers(client, operatingCompanyId, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "customers":
          report = await upsertCustomers(client, operatingCompanyId, companySlug, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "vendors":
          report = await upsertVendors(client, operatingCompanyId, companySlug, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "assets":
          report = await upsertAssets(client, operatingCompanyId, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "loads":
          report = await upsertLoads(client, operatingCompanyId, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "bank_accounts":
          report = await upsertBankAccounts(client, operatingCompanyId, rows, dryRun, abortOnAnyError, txnMode);
          break;
        case "bank_transactions":
          report = await upsertBankTransactions(client, operatingCompanyId, rows, dryRun, abortOnAnyError, txnMode);
          break;
        default:
          throw new Error("Unsupported seed type.");
      }
      mergedReport.inserted += report.inserted;
      mergedReport.skipped += report.skipped;
      mergedReport.errors.push(...report.errors.map((err) => ({ row: err.row, message: `[${companyCode}] ${err.message}` })));
    }
    return mergedReport;
  }

  if (preview) {
    const merged = await executeMerge(true, "isolated");
    return formatAdminPreview(merged, serializedRows);
  }

  const merged = await executeMerge(false, "participant");
  return {
    inserted_rows: merged.inserted,
    skipped_rows: merged.skipped,
    errors: merged.errors,
  };
}

