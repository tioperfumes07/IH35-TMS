import fs from "node:fs/promises";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

export const LOVES_CARD_IMPORT_SOURCE = "loves-card-import-cron";
export const LOVES_CARD_IMPORT_JOB = "fuel.loves_card_import_cron";

export type LovesImportRow = {
  station_uuid?: string;
  station_name: string;
  station_address: string;
  city?: string;
  state?: string;
  price_per_gallon: number;
};

export type LovesDeadLetter = {
  line_number: number;
  raw: string;
  reason: string;
};

export type LovesCsvParseResult = {
  rows: LovesImportRow[];
  dead_letters: LovesDeadLetter[];
};

export type LovesImportCounts = {
  rows_added: number;
  rows_updated: number;
  rows_skipped: number;
  dead_letters: number;
};

type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

let lastRunAt: string | null = null;
let lastRunError: string | null = null;
let lastRunCounts: LovesImportCounts | null = null;

export function resetLovesCardImportStateForTests() {
  lastRunAt = null;
  lastRunError = null;
  lastRunCounts = null;
}

export function getLovesCardImportRunSnapshot() {
  return {
    last_run_at: lastRunAt,
    last_run_error: lastRunError,
    last_run_counts: lastRunCounts,
  };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], candidates: string[]) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.indexOf(candidate.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseLovesCsv(csvText: string): LovesCsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { rows: [], dead_letters: [] };
  }

  const headerCells = splitCsvLine(lines[0] ?? "");
  const idxName = headerIndex(headerCells, ["station_name", "name", "location_name"]);
  const idxAddress = headerIndex(headerCells, ["station_address", "address", "address_line1"]);
  const idxPrice = headerIndex(headerCells, ["price_per_gallon", "price", "retail_price"]);
  const idxUuid = headerIndex(headerCells, ["station_uuid", "station_id", "location_id"]);
  const idxCity = headerIndex(headerCells, ["city"]);
  const idxState = headerIndex(headerCells, ["state"]);

  const rows: LovesImportRow[] = [];
  const dead_letters: LovesDeadLetter[] = [];

  for (let lineNo = 1; lineNo < lines.length; lineNo += 1) {
    const raw = lines[lineNo] ?? "";
    const cells = splitCsvLine(raw);
    const station_name = idxName >= 0 ? String(cells[idxName] ?? "").trim() : "";
    const station_address = idxAddress >= 0 ? String(cells[idxAddress] ?? "").trim() : "";
    const priceRaw = idxPrice >= 0 ? cells[idxPrice] : undefined;
    const price = Number(priceRaw);
    if (!station_name || !station_address || !Number.isFinite(price)) {
      dead_letters.push({
        line_number: lineNo + 1,
        raw,
        reason: "missing station_name, station_address, or price_per_gallon",
      });
      continue;
    }
    rows.push({
      station_uuid:
        idxUuid >= 0 ? String(cells[idxUuid] ?? "").trim() || undefined : undefined,
      station_name,
      station_address,
      city: idxCity >= 0 ? String(cells[idxCity] ?? "").trim() || undefined : undefined,
      state: idxState >= 0 ? String(cells[idxState] ?? "").trim() || undefined : undefined,
      price_per_gallon: price,
    });
  }

  return { rows, dead_letters };
}

export async function loadLovesCsvPayload(deps?: {
  csvUrl?: string | null;
  csvPath?: string | null;
  fetchImpl?: typeof fetch;
  readFileImpl?: typeof fs.readFile;
}): Promise<string | null> {
  const csvUrl = (deps?.csvUrl ?? process.env.LOVES_CARD_CSV_URL ?? "").trim();
  const csvPath = (deps?.csvPath ?? process.env.LOVES_CARD_CSV_PATH ?? "").trim();
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const readFileImpl = deps?.readFileImpl ?? fs.readFile;

  if (csvUrl) {
    const response = await fetchImpl(csvUrl);
    if (!response.ok) {
      throw new Error(`loves_csv_fetch_failed:${response.status}`);
    }
    return response.text();
  }
  if (csvPath) {
    return readFileImpl(csvPath, "utf8");
  }
  return null;
}

async function appendDeadLetterAudit(
  client: DbClient,
  operatingCompanyId: string,
  deadLetters: LovesDeadLetter[]
) {
  if (deadLetters.length === 0) return;
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    "fuel.loves_card_import_dead_letter",
    "warning",
    JSON.stringify({
      operating_company_id: operatingCompanyId,
      dead_letters: deadLetters.slice(0, 25),
      dead_letter_count: deadLetters.length,
      source: LOVES_CARD_IMPORT_SOURCE,
    }),
    "B13-LOVES-SYNC-RESTORE",
  ]);
}

export async function importLovesRowsForCompany(
  client: DbClient,
  operatingCompanyId: string,
  parsed: LovesCsvParseResult
): Promise<LovesImportCounts> {
  const counts: LovesImportCounts = {
    rows_added: 0,
    rows_updated: 0,
    rows_skipped: 0,
    dead_letters: parsed.dead_letters.length,
  };

  for (const row of parsed.rows) {
    const updateRes = await client
      .query(
        `
          UPDATE fuel.loves_prices_daily
          SET price_per_gallon = $1,
              station_uuid = COALESCE($2, station_uuid),
              city = COALESCE($3, city),
              state = COALESCE($4, state),
              source_file_name = $5,
              updated_at = now()
          WHERE operating_company_id = $6
            AND effective_date = current_date
            AND station_name = $7
            AND station_address = $8
        `,
        [
          row.price_per_gallon,
          row.station_uuid ?? null,
          row.city ?? null,
          row.state ?? null,
          LOVES_CARD_IMPORT_SOURCE,
          operatingCompanyId,
          row.station_name,
          row.station_address,
        ]
      )
      .catch(() => ({ rowCount: 0 }));
    if ((updateRes.rowCount ?? 0) > 0) {
      counts.rows_updated += 1;
      continue;
    }

    const insertRes = await client
      .query(
        `
          INSERT INTO fuel.loves_prices_daily (
            operating_company_id,
            effective_date,
            station_uuid,
            station_name,
            station_address,
            city,
            state,
            price_per_gallon,
            source_file_name,
            uploaded_by_user_id
          )
          VALUES ($1, current_date, $2, $3, $4, $5, $6, $7, $8, NULL)
        `,
        [
          operatingCompanyId,
          row.station_uuid ?? null,
          row.station_name,
          row.station_address,
          row.city ?? null,
          row.state ?? null,
          row.price_per_gallon,
          LOVES_CARD_IMPORT_SOURCE,
        ]
      )
      .catch(() => ({ rowCount: 0 }));
    if ((insertRes.rowCount ?? 0) > 0) counts.rows_added += 1;
    else counts.rows_skipped += 1;
  }

  await appendDeadLetterAudit(client, operatingCompanyId, parsed.dead_letters);
  return counts;
}

export async function runLovesCardImportTick(deps?: {
  withLuciaBypassImpl?: <T>(fn: (client: DbClient) => Promise<T>) => Promise<T>;
  loadCsvImpl?: typeof loadLovesCsvPayload;
  listCompanyIdsImpl?: (client: DbClient) => Promise<string[]>;
}) {
  const { withLuciaBypass } = await import("../auth/db.js");
  const withLuciaBypassImpl = deps?.withLuciaBypassImpl ?? withLuciaBypass;
  const loadCsvImpl = deps?.loadCsvImpl ?? loadLovesCsvPayload;

  const csvText = await loadCsvImpl();
  if (!csvText) {
    lastRunError = null;
    return { status: "disabled" as const, company_count: 0 };
  }

  const parsed = parseLovesCsv(csvText);
  const listCompanyIdsImpl =
    deps?.listCompanyIdsImpl ??
    (async (client: DbClient) => {
      const res = await client.query<{ operating_company_id: string }>(
        `
          SELECT id::text AS operating_company_id
          FROM org.companies
          WHERE is_active = true
            AND deactivated_at IS NULL
          ORDER BY id
        `
      );
      return res.rows.map((row) => row.operating_company_id);
    });

  try {
    const result = await withLuciaBypassImpl(async (rawClient) => {
      const client = rawClient as DbClient;
      const tableExists = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('fuel.loves_prices_daily') IS NOT NULL AS ok`
      );
      if (!tableExists.rows[0]?.ok) {
        throw new Error("loves_prices_daily_unavailable");
      }

      const companyIds = await listCompanyIdsImpl(client);
      const totals: LovesImportCounts = {
        rows_added: 0,
        rows_updated: 0,
        rows_skipped: 0,
        dead_letters: parsed.dead_letters.length,
      };

      for (const operatingCompanyId of companyIds) {
        assertTenantContext(operatingCompanyId, LOVES_CARD_IMPORT_JOB);
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          operatingCompanyId,
        ]);
        const counts = await importLovesRowsForCompany(client, operatingCompanyId, parsed);
        totals.rows_added += counts.rows_added;
        totals.rows_updated += counts.rows_updated;
        totals.rows_skipped += counts.rows_skipped;
      }

      return { company_count: companyIds.length, totals };
    });

    lastRunAt = new Date().toISOString();
    lastRunError = null;
    lastRunCounts = result.totals;
    return { status: "ok" as const, ...result };
  } catch (error) {
    lastRunAt = new Date().toISOString();
    lastRunError = String((error as Error)?.message ?? error);
    throw error;
  }
}

export type LovesSyncStatus = {
  last_synced_at: string | null;
  rows_imported_24h: number;
  status: "ok" | "stale" | "error" | "disabled" | "never";
};

export async function fetchLovesSyncStatus(operatingCompanyId: string): Promise<LovesSyncStatus> {
  const { withLuciaBypass } = await import("../auth/db.js");
  const snapshot = getLovesCardImportRunSnapshot();
  const csvConfigured =
    Boolean((process.env.LOVES_CARD_CSV_URL ?? "").trim()) ||
    Boolean((process.env.LOVES_CARD_CSV_PATH ?? "").trim());

  return withLuciaBypass(async (rawClient) => {
    const client = rawClient as DbClient;
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      operatingCompanyId,
    ]);

    const tableExists = await client.query<{ ok: boolean }>(
      `SELECT to_regclass('fuel.loves_prices_daily') IS NOT NULL AS ok`
    );
    if (!tableExists.rows[0]?.ok) {
      return { last_synced_at: null, rows_imported_24h: 0, status: "never" };
    }

    const res = await client.query<{ last_synced_at: string | null; rows_imported_24h: string }>(
      `
        SELECT
          max(updated_at)::text AS last_synced_at,
          count(*) FILTER (
            WHERE updated_at >= now() - interval '24 hours'
              AND coalesce(source_file_name, '') = $2
          )::text AS rows_imported_24h
        FROM fuel.loves_prices_daily
        WHERE operating_company_id = $1::uuid
      `,
      [operatingCompanyId, LOVES_CARD_IMPORT_SOURCE]
    );

    const last_synced_at =
      res.rows[0]?.last_synced_at ?? snapshot.last_run_at ?? null;
    const rows_imported_24h = Number(res.rows[0]?.rows_imported_24h ?? 0);

    if (snapshot.last_run_error) {
      return { last_synced_at, rows_imported_24h, status: "error" };
    }
    if (!csvConfigured) {
      return { last_synced_at, rows_imported_24h, status: "disabled" };
    }
    if (!last_synced_at) {
      return { last_synced_at: null, rows_imported_24h, status: "never" };
    }
    const ageHours = (Date.now() - new Date(last_synced_at).getTime()) / 3600000;
    if (ageHours > 26) {
      return { last_synced_at, rows_imported_24h, status: "stale" };
    }
    return { last_synced_at, rows_imported_24h, status: "ok" };
  });
}
