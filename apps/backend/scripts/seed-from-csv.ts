import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

dotenv.config();

type SeedType = "drivers" | "customers" | "vendors" | "assets";
type CompanyCode = "TRK" | "TRANSP";

const DRIVER_HEADERS = ["first_name", "last_name", "email", "phone", "cdl_number", "cdl_state", "cdl_class", "cdl_expires_at", "hire_date", "status"];
const CUSTOMER_HEADERS = ["customer_code", "customer_name", "billing_email", "billing_phone", "mc_number", "dot_number", "billing_address_line1", "billing_city", "billing_state", "billing_postal_code"];
const VENDOR_HEADERS = ["vendor_code", "vendor_name", "vendor_type", "phone", "email", "tax_id", "address_line1", "city", "state", "postal_code", "notes"];
const ASSET_HEADERS = ["asset_kind", "unit_number", "vin", "year", "make", "model", "equipment_type", "license_plate", "license_state", "notes"];

function parseArgv(argv: string[]) {
  const args: Record<string, string[] | boolean> = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith("--")) throw new Error(`Unexpected positional argument "${token}".`);
    const name = token.slice(2);
    const next = argv[i + 1];

    const booleanFlags = new Set(["dry-run", "help", "h"]);
    if (booleanFlags.has(name)) {
      args[name] = true;
      i += 1;
      continue;
    }

    if (!next || next.startsWith("--")) throw new Error(`Missing value after --${name}`);
    if (!args[name]) args[name] = [];
    (args[name] as string[]).push(next);
    i += 2;
  }

  return {
    dryRun: Boolean(args["dry-run"]),
    company: (args.company as string[] | undefined) ?? undefined,
    type: (args.type as string[] | undefined) ?? undefined,
    file: (args.file as string[] | undefined) ?? undefined,
    help: Boolean(args.help || args.h),
  };
}

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

function inferSeedMeta(fileBasename: string): { company?: CompanyCode; type?: SeedType } {
  const lower = fileBasename.toLowerCase();
  let company: CompanyCode | undefined;
  if (lower.startsWith("trk_")) company = "TRK";
  if (lower.startsWith("transp_")) company = "TRANSP";
  let seedType: SeedType | undefined;
  if (lower.includes("_drivers")) seedType = "drivers";
  if (lower.includes("_customers")) seedType = "customers";
  if (lower.includes("_vendors")) seedType = "vendors";
  if (lower.includes("_assets")) seedType = "assets";
  return { company, type: seedType };
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
  throw new Error(`Unsupported --type "${value}". Expected drivers | customers | vendors | assets`);
}

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

type RowReport = {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

async function upsertDrivers(
  client: pg.Client,
  companyId: string,
  parsedRows: Record<string, string>[],
  dryRun: boolean
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };

  await client.query("BEGIN");

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

    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
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
  dryRun: boolean
): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await client.query("BEGIN");
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
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
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
  dryRun: boolean
): Promise<RowReport> {
  const allowedTypes = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"];
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await client.query("BEGIN");
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
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return counters;
}

const EQUIPMENT_KINDS = new Set(["DryVan", "Reefer", "Flatbed", "Tanker", "Container", "Chassis", "StepDeck", "Lowboy"]);

async function upsertAssets(client: pg.Client, companyId: string, parsedRows: Record<string, string>[], dryRun: boolean): Promise<RowReport> {
  const counters: RowReport = { inserted: 0, skipped: 0, errors: [] };
  await client.query("BEGIN");

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
    await client.query(dryRun ? "ROLLBACK" : "COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  return counters;
}

async function main() {
  const argvTokens = parseArgv(process.argv.slice(2));
  if (argvTokens.help) {
    console.info(
      [
        "Usage:",
        "  npm run seed:from-csv -- --company TRK --type drivers --file db/seeds/trk_drivers.csv",
        "  npm run seed:from-csv -- --dry-run --file db/seeds/transp_assets.csv # infers TRANSP/assets",
      ].join("\n")
    );
    return;
  }

  if (!argvTokens.file || argvTokens.file.length !== 1) {
    throw new Error("Specify exactly one --file argument.");
  }
  const resolvedFileRaw = argvTokens.file?.[0];
  if (!resolvedFileRaw) throw new Error("--file path is required");

  let resolvedInput = resolvedFileRaw;
  const localOverrideCandidates = [];
  localOverrideCandidates.push(path.join(process.cwd(), "db", "seeds", "local", path.basename(resolvedInput)));
  for (const candidate of localOverrideCandidates) {
    try {
      await fs.access(candidate);
      resolvedInput = candidate;
      console.info(`[seed] Using local CSV override → ${candidate}`);
      break;
    } catch {
      // noop
    }
  }

  const absolutePath = path.isAbsolute(resolvedInput) ? resolvedInput : path.join(process.cwd(), resolvedInput);

  let companyCodeArg = argvTokens.company?.[0];
  let typeArg = argvTokens.type?.[0];
  const basename = path.basename(absolutePath, path.extname(absolutePath));
  const inferred = inferSeedMeta(basename);
  if (!companyCodeArg && inferred.company) companyCodeArg = inferred.company;
  if (!typeArg && inferred.type) typeArg = inferred.type;
  if (!companyCodeArg || !typeArg) {
    throw new Error("Unable to infer --company/--type from filename. Provide explicitly.");
  }

  const companyCode = parseCompany(companyCodeArg);
  const seedKind = parseType(typeArg);

  const csvContents = await fs.readFile(absolutePath, "utf8");
  const csvRowsRaw = csvSplitLines(csvContents);
  if (!csvRowsRaw.length) throw new Error("CSV is empty.");

  const headerRow = csvRowsRaw[0] ?? [];

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
    default:
      throw new Error("Unsupported loader type");
  }

  const serializedRows =
    csvRowsRaw.slice(1).map((row) => {
      const record: Record<string, string> = {};
      headerRow.forEach((header, idx) => {
        record[header.trim()] = row[idx] ?? "";
      });
      return record;
    });

  console.info(
    `[seed] Loaded ${serializedRows.length} data rows (${seedKind}, ${companyCode}) from ${path.relative(process.cwd(), absolutePath)}`
  );

  const dryRun = Boolean(argvTokens.dryRun);
  const connectionString = process.env.DATABASE_URL ?? process.env.DATABASE_DIRECT_URL;

  const companySlug = companyCode === "TRK" ? "TRK" : "TRANSP";

  if (!connectionString) {
    serializedRows.slice(0, 3).forEach((preview, previewIdx) => {
      console.info(`[seed] Preview row ${previewIdx + 1}: ${JSON.stringify(preview)}`);
    });
    console.info("\nREPORT (schema validation — no database connection)");
    console.info(JSON.stringify({ file: resolvedInput, company: companyCode, type: seedKind, validatedRows: serializedRows.length, dryRun }, null, 2));
    if (!dryRun) {
      console.error("[seed] DATABASE_URL/DATABASE_DIRECT_URL missing — cannot apply seeds without credentials.");
    }
    process.exit(dryRun ? 0 : 1);
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const operatingCompanyId = await resolveCompanyId(client, companyCode);
    let report: RowReport;
    switch (seedKind) {
      case "drivers":
        report = await upsertDrivers(client, operatingCompanyId, serializedRows, dryRun);
        break;
      case "customers":
        report = await upsertCustomers(client, operatingCompanyId, companySlug, serializedRows, dryRun);
        break;
      case "vendors":
        report = await upsertVendors(client, operatingCompanyId, companySlug, serializedRows, dryRun);
        break;
      case "assets":
        report = await upsertAssets(client, operatingCompanyId, serializedRows, dryRun);
        break;
      default:
        throw new Error("Unsupported seed type.");
    }

    console.info("\nREPORT");
    console.info(
      JSON.stringify(
        {
          file: resolvedInput,
          company: companyCode,
          operatingCompanyId,
          type: seedKind,
          inserted: report.inserted,
          skipped: report.skipped,
          errors: report.errors,
          dryRun,
        },
        null,
        2
      )
    );

    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error("Seed script failed:", (err as Error).message ?? err);
  process.exit(1);
});
