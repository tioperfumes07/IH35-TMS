/**
 * Relay Payments REST client — fuel-transaction pull only (no account/card management here).
 *
 * SECURITY: the API key is a SECRET. It is read from `process.env.RELAY_API_KEY` ONLY, at call time.
 * Never hardcode it, never log it, never include it in an error message/body. Auth is a raw API key
 * in the `Authorization` header (confirmed live — NOT "Bearer <key>").
 *
 * Base URL defaults to the confirmed staging endpoint; prod differs and is expected to be supplied via
 * `RELAY_API_BASE` (Render env) before this ingest is enabled in prod.
 *
 * @packageDocumentation
 */
import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";

export class RelayApiError extends Error {
  readonly statusCode: number | null;
  readonly body: unknown;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number | null, body: unknown, retryable: boolean) {
    super(message);
    this.name = "RelayApiError";
    this.statusCode = statusCode;
    this.body = body;
    this.retryable = retryable;
  }
}

// Confirmed live (staging). Prod base differs — set RELAY_API_BASE in Render.
const DEFAULT_RELAY_API_BASE = "https://staging.relaypayments.com/api/fuel/transactions/";

// FAIL-LOUD (2026-07-15): a missing/blank RELAY_API_BASE in production must THROW, never silently fall back
// to the STAGING endpoint. The silent staging fallback cost hours of "auth works but 0 rows" debugging. The
// staging default is allowed ONLY outside production (NODE_ENV !== "production").
export function relayApiBase(): string {
  const raw = process.env.RELAY_API_BASE?.trim();
  if (!raw || raw.length === 0) {
    if ((process.env.NODE_ENV ?? "").trim() === "production") {
      throw new RelayApiError(
        "relay_api_base_missing:RELAY_API_BASE must be set in production — refusing to fall back to the staging endpoint",
        null,
        null,
        false
      );
    }
    return DEFAULT_RELAY_API_BASE;
  }
  return raw.endsWith("/") ? raw : `${raw}/`;
}

// Per-request timeout. TRANSP has real volume (March 2026→now); the old 15s default aborted the pull before
// anything committed ("This operation was aborted"). Configurable via RELAY_API_TIMEOUT_MS; default 60s.
function relayTimeoutMs(): number {
  const raw = Number(process.env.RELAY_API_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60000;
}

// Bounded retry with exponential backoff for a slow/aborted window (retryable errors: aborted network
// timeout, 429, 5xx). A single slow window must not kill the whole company backfill.
const RELAY_MAX_RETRIES = 3;
const RELAY_RETRY_BASE_MS = 750;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the Relay API key from env ONLY. Never persisted, logged, or echoed back.
 *
 * PER-ENTITY: Relay issues a distinct key per carrier (e.g. IH35 Transportation vs USMCA Freight). The
 * entity-scoped var `RELAY_API_KEY_<CODE>` (e.g. `RELAY_API_KEY_TRANSP`, `RELAY_API_KEY_USMCA` — CODE is
 * the org.companies.code, upper-cased) takes precedence; the bare `RELAY_API_KEY` remains the fallback so
 * a single-entity setup keeps working unchanged. A company whose flag is ON but whose key var is unset
 * resolves to null and the caller throws relay_not_configured — never silently pulls another entity's key.
 */
export function relayApiKey(entityCode?: string | null): string | null {
  const code = entityCode?.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (code) {
    // Entity-scoped: resolve ONLY the scoped key. If unset, return null (the caller throws
    // relay_not_configured) — NEVER fall back to the bare global key, which would pull ANOTHER
    // entity's fuel transactions under the wrong operating_company_id (cross-entity financial-data
    // leak). The global fallback is legitimate ONLY when no entityCode is supplied (legacy path).
    const scoped = process.env[`RELAY_API_KEY_${code}`]?.trim();
    return scoped && scoped.length > 0 ? scoped : null;
  }
  // Legacy single-entity path (no entityCode supplied): the bare global key.
  const key = process.env.RELAY_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function relayHeaders(key: string): Record<string, string> {
  // Confirmed live: Authorization header carries the raw key value — no "Bearer " prefix.
  return { Authorization: key, Accept: "application/json" };
}

// Timeout-bounded fetch — a bare fetch() has no timeout; a stalled Relay socket must never hold the
// daily-ingest cron's DB transaction open indefinitely (connection-pool exhaustion risk, same reason
// Samsara's client does this).
export async function relayFetch(url: URL | string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

// One request attempt: fetch (timeout-bounded) + classify. Throws a RelayApiError (retryable flag set) on a
// network/abort error or a non-2xx response.
async function relayGetOnce(url: URL, key: string): Promise<Response> {
  let res: Response;
  try {
    res = await withCircuitBreaker("relay", () => relayFetch(url, { headers: relayHeaders(key) }, relayTimeoutMs()));
  } catch (error) {
    throw new RelayApiError(`relay_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
  }
  if (!res.ok) {
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    throw new RelayApiError(`relay_http_${res.status}`, res.status, body, retryable);
  }
  return res;
}

// Retry a retryable failure (aborted/timeout, 429, 5xx) with exponential backoff. A non-retryable error
// (auth/4xx, relay_not_configured) throws immediately.
async function relayGetWithRetry(url: URL, key: string): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      return await relayGetOnce(url, key);
    } catch (error) {
      const retryable = error instanceof RelayApiError && error.retryable;
      if (retryable && attempt < RELAY_MAX_RETRIES) {
        await sleep(RELAY_RETRY_BASE_MS * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}

export type RelayFuelPrompt = { label: string; value: string };
export type RelayFuelFee = { type: string | null; amount: string | null };
export type RelayFuelItem = {
  fuel_type: string | null;
  fuel_type_description: string | null;
  fuel_product_code: string | null;
  retail_price_per_unit: string | null;
  discounted_price_per_unit: string | null;
  volume: string | null;
  volume_uom: string | null;
  total_retail_price: string | null;
  total_discounted_price: string | null;
  fee: RelayFuelFee | null;
};
export type RelayLinkedOrg = { id: string | null; name: string | null; number: string | null };
export type RelayDriver = {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  integration_id: string | null;
};
export type RelayMerchant = { id: string | null; name: string | null; number: string | null };
export type RelayLocation = {
  id: string | null;
  name: string | null;
  fuel_merchant_location_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  opis_id: string | null;
  timezone: string | null;
};

export type RelayFuelTransaction = {
  transaction_id: string;
  created_at: string;
  relay_fuel_code: string | null;
  total_amount_paid: string;
  total_retail_price: string;
  total_amount_saved: string | null;
  is_direct_bill: boolean | null;
  currency_code: string | null;
  cash_advance: boolean | null;
  fuel_code_type: string | null;
  linked_org: RelayLinkedOrg | null;
  driver: RelayDriver | null;
  merchant: RelayMerchant | null;
  location: RelayLocation | null;
  prompts: RelayFuelPrompt[];
  fuel_items: RelayFuelItem[];
  fees: unknown[];
  products: unknown[];
  // Anything else Relay sends that isn't in the confirmed schema is preserved via raw_payload at the
  // ingest layer (the full parsed JSON object is archived verbatim), never dropped.
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Coerce Relay id/timestamp fields that may arrive as number or alternate keys (CSV uses `id`). */
function strOrCoerce(value: unknown): string | null {
  const direct = str(value);
  if (direct) return direct;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function coerceCreatedAt(row: Record<string, unknown>): string | null {
  const candidates = [row.created_at, row.createdAt, row.processing_time, row.processed_at, row.timestamp];
  for (const c of candidates) {
    const s = strOrCoerce(c);
    if (s) return s;
  }
  return null;
}

function extractRelayRowArray(json: unknown): { rows: unknown[]; envelope: string } {
  if (Array.isArray(json)) return { rows: json, envelope: "array" };
  const obj = asObject(json);
  if (!obj) return { rows: [], envelope: "non_object" };
  const nestedData = asObject(obj.data);
  const candidates: Array<[string, unknown]> = [
    ["data", obj.data],
    ["results", obj.results],
    ["transactions", obj.transactions],
    ["items", obj.items],
    ["fuel_transactions", obj.fuel_transactions],
    ["data.results", nestedData?.results],
    ["data.transactions", nestedData?.transactions],
    ["data.items", nestedData?.items],
  ];
  for (const [name, value] of candidates) {
    if (Array.isArray(value)) return { rows: value, envelope: name };
  }
  return { rows: [], envelope: `keys:${Object.keys(obj).slice(0, 12).join(",")}` };
}

/** Defensive parse of one raw transaction row into the confirmed shape. Never throws on shape drift —
 *  a malformed/unexpected row is skipped by the caller (dead-lettered), not allowed to crash the whole
 *  pull. The FULL raw row is separately archived verbatim by the ingest service regardless of parse
 *  outcome, so nothing Relay sends is ever silently lost. */
export function parseRelayFuelTransactionRow(row: Record<string, unknown>): RelayFuelTransaction | null {
  // API often sends `id`; CSV importer already maps id→transaction_id. Accept both (add-only).
  const transaction_id =
    strOrCoerce(row.transaction_id) ?? strOrCoerce(row.id) ?? strOrCoerce(row.transactionId);
  const created_at = coerceCreatedAt(row);
  if (!transaction_id || !created_at) return null;

  const linkedOrgRaw = asObject(row.linked_org);
  const driverRaw = asObject(row.driver);
  const merchantRaw = asObject(row.merchant);
  const locationRaw = asObject(row.location);

  const prompts = asArray(row.prompts)
    .map((p) => asObject(p))
    .filter((p): p is Record<string, unknown> => Boolean(p))
    .map((p) => ({ label: String(p.label ?? ""), value: String(p.value ?? "") }));

  const fuel_items = asArray(row.fuel_items)
    .map((fi) => asObject(fi))
    .filter((fi): fi is Record<string, unknown> => Boolean(fi))
    .map((fi) => {
      const feeRaw = asObject(fi.fee);
      return {
        fuel_type: str(fi.fuel_type),
        fuel_type_description: str(fi.fuel_type_description),
        fuel_product_code: str(fi.fuel_product_code),
        retail_price_per_unit: str(fi.retail_price_per_unit),
        discounted_price_per_unit: str(fi.discounted_price_per_unit),
        volume: str(fi.volume),
        volume_uom: str(fi.volume_uom),
        total_retail_price: str(fi.total_retail_price),
        total_discounted_price: str(fi.total_discounted_price),
        fee: feeRaw ? { type: str(feeRaw.type), amount: str(feeRaw.amount) } : null,
      };
    });

  return {
    transaction_id,
    created_at,
    relay_fuel_code: str(row.relay_fuel_code),
    total_amount_paid: str(row.total_amount_paid) ?? "0",
    total_retail_price: str(row.total_retail_price) ?? "0",
    total_amount_saved: str(row.total_amount_saved),
    is_direct_bill: typeof row.is_direct_bill === "boolean" ? row.is_direct_bill : null,
    currency_code: str(row.currency_code),
    cash_advance: typeof row.cash_advance === "boolean" ? row.cash_advance : null,
    fuel_code_type: str(row.fuel_code_type),
    linked_org: linkedOrgRaw
      ? { id: str(linkedOrgRaw.id), name: str(linkedOrgRaw.name), number: str(linkedOrgRaw.number) }
      : null,
    driver: driverRaw
      ? {
          id: str(driverRaw.id),
          first_name: str(driverRaw.first_name),
          last_name: str(driverRaw.last_name),
          phone: str(driverRaw.phone),
          email: str(driverRaw.email),
          integration_id: str(driverRaw.integration_id),
        }
      : null,
    merchant: merchantRaw
      ? { id: str(merchantRaw.id), name: str(merchantRaw.name), number: str(merchantRaw.number) }
      : null,
    location: locationRaw
      ? {
          id: str(locationRaw.id),
          name: str(locationRaw.name),
          fuel_merchant_location_id: str(locationRaw.fuel_merchant_location_id),
          address: str(locationRaw.address),
          city: str(locationRaw.city),
          state: str(locationRaw.state),
          zip_code: str(locationRaw.zip_code),
          latitude: (locationRaw.latitude as number | string | null) ?? null,
          longitude: (locationRaw.longitude as number | string | null) ?? null,
          opis_id: str(locationRaw.opis_id),
          timezone: str(locationRaw.timezone),
        }
      : null,
    prompts,
    fuel_items,
    fees: asArray(row.fees),
    products: asArray(row.products),
  };
}

/**
 * GET the fuel-transactions feed for a date range.
 *
 * NOTE — query-parameter names are NOT yet confirmed against live Relay API docs beyond the base URL
 * + auth + response-schema facts given for this build; `start_date`/`end_date` (ISO 8601 dates) are the
 * conventional Relay pattern and are used here, but MUST be verified against Relay's own API reference
 * (or a live smoke pull) before this cron is enabled in any environment. Flagged in
 * docs/specs/relay-fuel-ingest.md as a pre-launch verification item — never silently assumed correct.
 *
 * Pagination shape is likewise unconfirmed; this reads a single page and returns whatever Relay sends
 * back as a top-level array (or a `data` array wrapper) — extend here if Relay's docs show a cursor.
 */
export async function listRelayFuelTransactions(params: {
  startDate: string; // ISO 8601 date, e.g. "2026-07-01"
  endDate: string;
  /** org.companies.code of the entity being pulled — selects RELAY_API_KEY_<CODE> (falls back to RELAY_API_KEY). */
  entityCode?: string | null;
}): Promise<RelayFuelTransaction[]> {
  const key = relayApiKey(params.entityCode);
  if (!key) {
    throw new RelayApiError("relay_not_configured", null, null, false);
  }

  const first = new URL(relayApiBase());
  first.searchParams.set("start_date", params.startDate);
  first.searchParams.set("end_date", params.endDate);

  // Retry + defensive pagination. Each page is fetched with timeout + bounded retry (relayGetWithRetry).
  // Windows are 3 days at the ingest layer so a single page almost always returns everything; this loop is a
  // safety net that follows a `next`/`next_page` URL if Relay sends one. MAX_PAGES + a no-progress guard
  // prevent any runaway loop. De-dup by transaction_id so an overlapping cursor page can't double-count.
  const collected: RelayFuelTransaction[] = [];
  const seen = new Set<string>();
  let nextUrl: URL | null = first;
  let pages = 0;
  const MAX_PAGES = 500;

  while (nextUrl && pages < MAX_PAGES) {
    pages += 1;
    const res = await relayGetWithRetry(nextUrl, key);
    const json = await readJsonResponse(res);
    const obj = asObject(json);
    const { rows, envelope } = extractRelayRowArray(json);
    let parsedCount = 0;
    let skippedCount = 0;
    for (const r of rows) {
      const row = asObject(r);
      if (!row) {
        skippedCount += 1;
        continue;
      }
      const parsed = parseRelayFuelTransactionRow(row);
      if (parsed && !seen.has(parsed.transaction_id)) {
        seen.add(parsed.transaction_id);
        collected.push(parsed);
        parsedCount += 1;
      } else if (!parsed) {
        skippedCount += 1;
      }
    }
    // Empty parse with a non-empty body must be loud — matches live USMCA "success / pulled=0" failure mode.
    if (rows.length === 0 || (rows.length > 0 && parsedCount === 0)) {
      const sampleKeys = rows
        .slice(0, 1)
        .map((r) => Object.keys(asObject(r) ?? {}).slice(0, 20).join(","))
        .join("|");
      // eslint-disable-next-line no-console -- intentional ops signal until structured logger is injected here
      console.warn(
        `[RELAY_FUEL] empty_parse envelope=${envelope} raw_rows=${rows.length} parsed=${parsedCount} skipped=${skippedCount} sample_keys=${sampleKeys || "n/a"}`
      );
    }
    nextUrl = resolveNextPage(obj, nextUrl);
  }

  return collected;
}

// Conservative next-page resolver. Relay's exact pagination shape is UNCONFIRMED, so this follows ONLY an
// explicit `next`/`next_page` URL (the standard REST cursor pattern) and stops otherwise — it does NOT guess
// cursor query-param names (which could loop or mis-page). Combined with 3-day ingest windows, single-page is
// the normal case; this is a safety net. Returns null (stop) if absent or if the URL doesn't advance.
function resolveNextPage(obj: Record<string, unknown> | null, current: URL): URL | null {
  if (!obj) return null;
  const paging = asObject(obj.paging) ?? asObject(obj.pagination) ?? {};
  const nextRaw = str(obj.next) ?? str(obj.next_page) ?? str(paging.next) ?? str(paging.next_page);
  if (!nextRaw) return null;
  let candidate: URL;
  try {
    candidate = new URL(nextRaw, current);
  } catch {
    return null;
  }
  return candidate.toString() === current.toString() ? null : candidate;
}
