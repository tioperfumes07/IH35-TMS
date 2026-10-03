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
import { relayApiTimeoutMs } from "../../lib/relay-timeout.js";

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

// Per-request timeout — single source of truth lives in lib/relay-timeout.ts so the circuit breaker's
// timeout can be derived from the SAME value (breaker = fetch + slack). Full-history pulls can exceed 40s
// (Mike Bruno 2026-07-16: 41.35s / 2.1MB); date-filtered pulls use dtstart/dtend (Mike) and are shorter.
function relayTimeoutMs(): number {
  return relayApiTimeoutMs();
}

/**
 * Relay date-range query params (Mike Masteller, Relay, 2026-07-16 — LOCKED).
 * Wrong names (`start_date`/`end_date`) are IGNORED by production; the live-proven names are
 * `dtstart` and `dtend`. Format: YYYY-MM-DD (inclusive calendar range).
 */
export function applyRelayDateRangeParams(url: URL, startDate?: string | null, endDate?: string | null): URL {
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) url.searchParams.set("dtstart", startDate);
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) url.searchParams.set("dtend", endDate);
  // Never send the wrong param names — they silently no-op and look like "Relay ignores dates".
  url.searchParams.delete("start_date");
  url.searchParams.delete("end_date");
  return url;
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
// network/abort error or a non-2xx response. `timeoutMs` lets the windowed pull ask for a short per-call budget;
// it is clamped to relayApiTimeoutMs() so the breaker (fetch + slack) can never fire first.
async function relayGetOnce(url: URL, key: string, timeoutMs: number = relayTimeoutMs()): Promise<Response> {
  const budgetMs = Math.min(Math.max(1, timeoutMs), relayTimeoutMs());
  let res: Response;
  try {
    res = await withCircuitBreaker("relay", () => relayFetch(url, { headers: relayHeaders(key) }, budgetMs));
  } catch (error) {
    throw new RelayApiError(`relay_network_error:${String((error as Error)?.message ?? error)}`, null, null, true);
  }
  if (!res.ok) {
    const body = await readJsonResponse(res);
    const retryable = res.status === 429 || res.status >= 500;
    // Preserve Retry-After so relayGetWithRetry can honor it (GUARD live 429 stack 2026-07-16).
    const retryAfter = res.headers.get("Retry-After");
    const enriched =
      retryAfter && body && typeof body === "object" && !Array.isArray(body)
        ? { ...(body as Record<string, unknown>), retry_after: retryAfter }
        : retryAfter
          ? { retry_after: retryAfter, _body: body }
          : body;
    throw new RelayApiError(`relay_http_${res.status}`, res.status, enriched, retryable);
  }
  return res;
}

// Retry a retryable failure (aborted/timeout, 429, 5xx) with exponential backoff. A non-retryable error
// (auth/4xx, relay_not_configured) throws immediately. The windowed pull passes maxRetries 0: its own loop
// owns retries, so every call it makes stays behind the >=10s pacer (Relay's "10 second limit").
async function relayGetWithRetry(
  url: URL,
  key: string,
  opts: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? RELAY_MAX_RETRIES;
  let attempt = 0;
  for (;;) {
    try {
      return await relayGetOnce(url, key, opts.timeoutMs);
    } catch (error) {
      const retryable = error instanceof RelayApiError && error.retryable;
      if (retryable && attempt < maxRetries) {
        // Honor Retry-After on 429 when present; otherwise exponential backoff.
        const retryAfterMs = retryAfterMsFromRelayError(error);
        const backoffMs = retryAfterMs ?? RELAY_RETRY_BASE_MS * 2 ** attempt;
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}

/** Parse Retry-After (seconds or HTTP-date) from a 429 RelayApiError body/headers proxy. */
export function retryAfterMsFromRelayError(error: unknown): number | null {
  if (!(error instanceof RelayApiError) || error.statusCode !== 429) return null;
  const body = error.body;
  let header: string | null = null;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rec = body as Record<string, unknown>;
    const raw = rec.retry_after ?? rec.retryAfter ?? rec["Retry-After"];
    if (typeof raw === "string" || typeof raw === "number") header = String(raw);
  }
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.min(asSeconds * 1000, 120_000);
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) return Math.min(Math.max(asDate - Date.now(), 0), 120_000);
  return null;
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

/**
 * A Relay row refused as a whole because a money field is not in the one accepted shape. Thrown by
 * parseRelayFuelTransactionRow; every caller catches it, counts the row as rejected with this reason, and
 * surfaces it (log + audit / failed tick) — it is never turned into a $0.00 or a skipped-without-reason row.
 */
export class RelayRowRejectedError extends Error {
  readonly transactionId: string | null;
  readonly field: string;
  readonly reason: string;

  constructor(transactionId: string | null, field: string, reason: string) {
    super(`relay_row_rejected:${reason} field=${field} transaction_id=${transactionId ?? "?"}`);
    this.name = "RelayRowRejectedError";
    this.transactionId = transactionId;
    this.field = field;
    this.reason = reason;
  }
}

/**
 * THE one accepted Relay money shape: a plain decimal DOLLAR STRING ("182.44", "0.00", "3.899", "-12.50").
 * Why this one: the confirmed schema types every money field as a string (RelayFuelTransaction below), Relay
 * (Mike Bruno 2026-07-16) told us prod sends dollar strings ("0.00"), the existing tests and the CSV mapper
 * feed dollar strings, and the ingest has always stored round(dollars * 100) as cents. Relay has NOT confirmed
 * whether the API ever sends integer cents, so a JSON number is refused (it could be either), as is any string
 * Number() would have bent into a value ("$1.00", "1,234.00", "1e3", " 12.00").
 */
export const RELAY_DOLLAR_STRING = /^-?\d+(?:\.\d+)?$/;

function describeReceived(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return `string ${JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value)}`;
  if (typeof value === "number") return `number ${String(value)}`;
  return typeof value;
}

/**
 * Validate one Relay money field. Absent (undefined / null / blank string) -> null, or a rejection when the
 * field is required. A dollar string is returned UNCHANGED (the cents conversion downstream is untouched).
 * Anything else throws RelayRowRejectedError naming the field and the received type.
 */
export function relayMoneyField(
  value: unknown,
  field: string,
  transactionId: string | null,
  required: boolean
): string | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) throw new RelayRowRejectedError(transactionId, field, `money_field_missing:${field}`);
    return null;
  }
  if (typeof value === "string" && RELAY_DOLLAR_STRING.test(value)) return value;
  throw new RelayRowRejectedError(
    transactionId,
    field,
    `money_field_unexpected_type:${field} expected a dollar string like "182.44", received ${describeReceived(value)}`
  );
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

/** Normalize Relay cash_advance into boolean | null for our schema. Two shapes only: the schema's boolean, or
 *  the dollar string prod actually sends ("0.00" -> false, "25.00" -> true; Mike Bruno 2026-07-16). A number or
 *  any other string ("yes", "$25") is refused through relayMoneyField, never guessed at. */
function coerceCashAdvance(value: unknown, transactionId: string): boolean | null {
  if (typeof value === "boolean") return value;
  const dollars = relayMoneyField(value, "cash_advance", transactionId, false);
  return dollars === null ? null : Number(dollars) !== 0;
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

/** Parse one raw transaction row into the confirmed shape. A row with no id/timestamp returns null (skipped).
 *  A row whose MONEY field is missing (when required) or not a dollar string THROWS RelayRowRejectedError —
 *  callers catch it per row, so one bad row is rejected with a named reason without crashing the whole pull,
 *  and is never stored as a wrong-but-plausible amount (the old `?? "0"` did exactly that). */
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
    .map((fi, i) => {
      const feeRaw = asObject(fi.fee);
      const money = (value: unknown, name: string) =>
        relayMoneyField(value, `fuel_items[${i}].${name}`, transaction_id, false);
      return {
        fuel_type: str(fi.fuel_type),
        fuel_type_description: str(fi.fuel_type_description),
        fuel_product_code: str(fi.fuel_product_code),
        retail_price_per_unit: money(fi.retail_price_per_unit, "retail_price_per_unit"),
        discounted_price_per_unit: money(fi.discounted_price_per_unit, "discounted_price_per_unit"),
        volume: str(fi.volume),
        volume_uom: str(fi.volume_uom),
        total_retail_price: money(fi.total_retail_price, "total_retail_price"),
        total_discounted_price: money(fi.total_discounted_price, "total_discounted_price"),
        fee: feeRaw ? { type: str(feeRaw.type), amount: money(feeRaw.amount, "fee.amount") } : null,
      };
    });

  return {
    transaction_id,
    created_at,
    relay_fuel_code: str(row.relay_fuel_code),
    // Required: a missing total used to become "0" here and land as a real-looking $0.00 fill.
    total_amount_paid: relayMoneyField(row.total_amount_paid, "total_amount_paid", transaction_id, true) as string,
    total_retail_price: relayMoneyField(row.total_retail_price, "total_retail_price", transaction_id, true) as string,
    total_amount_saved: relayMoneyField(row.total_amount_saved, "total_amount_saved", transaction_id, false),
    is_direct_bill: typeof row.is_direct_bill === "boolean" ? row.is_direct_bill : null,
    currency_code: str(row.currency_code),
    // Prod sends dollar strings ("0.00") — Mike Bruno 2026-07-16 — not always boolean.
    cash_advance: coerceCashAdvance(row.cash_advance, transaction_id),
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

/** UTC calendar date (YYYY-MM-DD) from a Relay `created_at` timestamp. */
export function relayTransactionCalendarDate(createdAt: string): string | null {
  const trimmed = createdAt.trim();
  if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Inclusive [startDate,endDate] filter on Relay `created_at` (UTC calendar day). */
export function filterRelayFuelTransactionsByDateRange(
  rows: RelayFuelTransaction[],
  startDate: string,
  endDate: string
): RelayFuelTransaction[] {
  return rows.filter((row) => {
    const day = relayTransactionCalendarDate(row.created_at);
    return day != null && day >= startDate && day <= endDate;
  });
}

export type RelayRejectedRow = { transaction_id: string | null; field: string; reason: string };

type RelayFuelFetchMeta = {
  api_row_count: number;
  pages_fetched: number;
  envelope: string;
  /** Rows refused by parseRelayFuelTransactionRow (money field missing / wrong shape) — never stored. */
  rejected: RelayRejectedRow[];
};

/** Spacing between Relay HTTP calls. `beforeCall` waits until the previous call is at least the interval old. */
export type RelayCallPacer = { beforeCall: () => Promise<void>; afterCall: () => void };

/** Largest dtstart..dtend span (inclusive days) one call may ask for. Anything wider must be windowed
 *  (fetchRelayFuelTransactionsInWindows) — one call for months of history is what blew the timeout. */
export const RELAY_MAX_SINGLE_CALL_SPAN_DAYS = 31;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive day count of [startDate, endDate]; null when either is not YYYY-MM-DD or start > end. */
export function relayWindowSpanDays(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate || !ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Pull fuel transactions from Relay for ONE bounded window (prod-verified 2026-07-16).
 *
 * - Server filter via `dtstart`/`dtend` (Mike 2026-07-16). The old `start_date`/`end_date` names are
 *   ignored by Relay — that was the "dates don't work" false finding.
 * - REFUSES an unfiltered pull (missing/invalid dates) and any span wider than
 *   RELAY_MAX_SINGLE_CALL_SPAN_DAYS. Relay will serve all history in one call, but it also has a "10 second
 *   limit on pulling transactions" (Relay, relayed 2026-10-03); history goes through dated windows instead.
 * - Client-side filter remains as a safety net after the server response.
 */
export async function fetchAllRelayFuelTransactions(
  entityCode: string | null | undefined,
  opts: {
    startDate: string;
    endDate: string;
    /** Per-call fetch budget; clamped to relayApiTimeoutMs(). Default: relayApiTimeoutMs(). */
    timeoutMs?: number;
    /** Inner retries on a retryable error. The windowed pull passes 0 and retries behind its pacer. */
    maxRetries?: number;
    /** Spaces every page request (each page is its own HTTP call). */
    pacer?: RelayCallPacer;
  }
): Promise<{ rows: RelayFuelTransaction[]; meta: RelayFuelFetchMeta }> {
  const span = relayWindowSpanDays(opts?.startDate, opts?.endDate);
  if (span === null) {
    throw new RelayApiError(
      `relay_unbounded_pull_refused:dtstart/dtend required as YYYY-MM-DD with start <= end (got ${String(opts?.startDate)}..${String(opts?.endDate)})`,
      null,
      null,
      false
    );
  }
  if (span > RELAY_MAX_SINGLE_CALL_SPAN_DAYS) {
    throw new RelayApiError(
      `relay_window_too_wide:${opts.startDate}..${opts.endDate} is ${span} days; one call may span at most ${RELAY_MAX_SINGLE_CALL_SPAN_DAYS} — use fetchRelayFuelTransactionsInWindows`,
      null,
      null,
      false
    );
  }
  const key = relayApiKey(entityCode);
  if (!key) {
    throw new RelayApiError("relay_not_configured", null, null, false);
  }

  const first = applyRelayDateRangeParams(new URL(relayApiBase()), opts.startDate, opts.endDate);
  const collected: RelayFuelTransaction[] = [];
  const rejected: RelayRejectedRow[] = [];
  const seen = new Set<string>();
  let nextUrl: URL | null = first;
  let pages = 0;
  let lastEnvelope = "none";
  const MAX_PAGES = 500;

  while (nextUrl && pages < MAX_PAGES) {
    pages += 1;
    await opts.pacer?.beforeCall();
    let res: Response;
    try {
      res = await relayGetWithRetry(nextUrl, key, { timeoutMs: opts.timeoutMs, maxRetries: opts.maxRetries });
    } finally {
      opts.pacer?.afterCall();
    }
    const json = await readJsonResponse(res);
    const obj = asObject(json);
    const { rows, envelope } = extractRelayRowArray(json);
    lastEnvelope = envelope;
    let parsedCount = 0;
    let skippedCount = 0;
    for (const r of rows) {
      const row = asObject(r);
      if (!row) {
        skippedCount += 1;
        continue;
      }
      let parsed: RelayFuelTransaction | null;
      try {
        parsed = parseRelayFuelTransactionRow(row);
      } catch (error) {
        if (!(error instanceof RelayRowRejectedError)) throw error;
        rejected.push({ transaction_id: error.transactionId, field: error.field, reason: error.reason });
        // eslint-disable-next-line no-console -- fail-loud: a refused money field is never silently dropped
        console.error(`[RELAY_FUEL] row_rejected ${error.message}`);
        continue;
      }
      if (parsed && !seen.has(parsed.transaction_id)) {
        seen.add(parsed.transaction_id);
        collected.push(parsed);
        parsedCount += 1;
      } else if (!parsed) {
        skippedCount += 1;
      }
    }
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

  return {
    rows: collected,
    meta: { api_row_count: collected.length, pages_fetched: pages, envelope: lastEnvelope, rejected },
  };
}

/**
 * GET fuel transactions for an inclusive UTC date window.
 *
 * Server filter: `dtstart`/`dtend` (Mike). Client filter: belt-and-suspenders on `created_at`.
 */
export async function listRelayFuelTransactions(params: {
  startDate: string; // ISO 8601 date, e.g. "2026-07-01"
  endDate: string;
  /** org.companies.code of the entity being pulled — selects RELAY_API_KEY_<CODE> (falls back to RELAY_API_KEY). */
  entityCode?: string | null;
  /** When set (backfill), skip the HTTP round-trip and filter this in-memory snapshot. */
  preloaded?: RelayFuelTransaction[];
}): Promise<RelayFuelTransaction[]> {
  let source = params.preloaded;
  if (!source) {
    const { rows, meta } = await fetchAllRelayFuelTransactions(params.entityCode, {
      startDate: params.startDate,
      endDate: params.endDate,
    });
    // This helper returns rows only, so a refused row would vanish here — fail the whole call instead.
    if (meta.rejected.length > 0) {
      throw new RelayApiError(
        `relay_rows_rejected:${meta.rejected.length} in ${params.startDate}..${params.endDate}; first: ${meta.rejected[0].reason}`,
        null,
        meta.rejected,
        false
      );
    }
    source = rows;
  }
  const filtered = filterRelayFuelTransactionsByDateRange(source, params.startDate, params.endDate);

  if (source.length > 0 && filtered.length === 0) {
    // eslint-disable-next-line no-console -- fail-loud: distinguishes empty account vs wrong date slice
    console.warn(
      `[RELAY_FUEL] date_filter_zero api_rows=${source.length} window=${params.startDate}..${params.endDate} entity=${params.entityCode ?? "legacy"}`
    );
  }

  return filtered;
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
