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

// Confirmed live (staging). Prod base differs — set RELAY_API_BASE in Render before flipping the
// per-entity RELAY_FUEL_INGEST_ENABLED flag on in prod.
const DEFAULT_RELAY_API_BASE = "https://staging.relaypayments.com/api/fuel/transactions/";

function relayApiBase(): string {
  const raw = process.env.RELAY_API_BASE?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_RELAY_API_BASE;
  return base.endsWith("/") ? base : `${base}/`;
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
    const scoped = process.env[`RELAY_API_KEY_${code}`]?.trim();
    if (scoped && scoped.length > 0) return scoped;
  }
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

/** Defensive parse of one raw transaction row into the confirmed shape. Never throws on shape drift —
 *  a malformed/unexpected row is skipped by the caller (dead-lettered), not allowed to crash the whole
 *  pull. The FULL raw row is separately archived verbatim by the ingest service regardless of parse
 *  outcome, so nothing Relay sends is ever silently lost. */
export function parseRelayFuelTransactionRow(row: Record<string, unknown>): RelayFuelTransaction | null {
  const transaction_id = str(row.transaction_id);
  const created_at = str(row.created_at);
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

  const url = new URL(relayApiBase());
  url.searchParams.set("start_date", params.startDate);
  url.searchParams.set("end_date", params.endDate);

  let res: Response;
  try {
    res = await withCircuitBreaker("relay", () => relayFetch(url, { headers: relayHeaders(key) }));
  } catch (error) {
    throw new RelayApiError(`relay_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
  }

  if (!res.ok) {
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    throw new RelayApiError(`relay_http_${res.status}`, res.status, body, retryable);
  }

  const json = await readJsonResponse(res);
  const rows: unknown[] = Array.isArray(json)
    ? json
    : Array.isArray((json as Record<string, unknown> | null)?.data)
      ? ((json as Record<string, unknown>).data as unknown[])
      : [];

  return rows
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => parseRelayFuelTransactionRow(r))
    .filter((t): t is RelayFuelTransaction => t !== null);
}
