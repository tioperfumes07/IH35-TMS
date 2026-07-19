import {
  FmcsaPermanentError,
  FmcsaRetryableError,
  parseRetryAfterMs,
} from "./fmcsa-http-errors.js";

type LookupType = "usdot" | "mc";

export type CarrierResult = {
  legal_name: string;
  dba_name: string | null;
  usdot_number: string;
  mc_number: string | null;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  phone: string | null;
  authority_status: "ACTIVE" | "INACTIVE" | "REVOKED" | "NONE";
  insurance_status: string | null;
  safety_rating: string | null;
  raw: unknown;
};

const FMCSA_TIMEOUT_MS = 30_000;
const FMCSA_MOBILE_BASE = "https://mobile.fmcsa.dot.gov/qc/services";
const FMCSA_SAFER_BASE = "https://safer.fmcsa.dot.gov/query.asp";
const FMCSA_MOBILE_KEY = process.env.FMCSA_MOBILE_API_KEY;

function normalizeLookupValue(type: LookupType, value: string) {
  const trimmed = value.trim();
  if (type === "mc") {
    return trimmed.replace(/^MC[-\s]*/i, "");
  }
  return trimmed;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = FMCSA_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new FmcsaRetryableError("FMCSA timeout", { status: null })),
      timeoutMs
    );
    promise
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAuthorityStatus(value: string | null): CarrierResult["authority_status"] {
  const v = (value ?? "").toUpperCase();
  if (v.includes("AUTHORIZED")) return "ACTIVE";
  if (v.includes("NOT AUTHORIZED")) return "INACTIVE";
  if (v.includes("ACTIVE")) return "ACTIVE";
  if (v.includes("REVOK")) return "REVOKED";
  if (v.includes("INACTIVE")) return "INACTIVE";
  return "NONE";
}

function extractRecordFromMobilePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.content && typeof obj.content === "object") {
    const content = obj.content as Record<string, unknown>;
    if (content.carrier && typeof content.carrier === "object") return content.carrier as Record<string, unknown>;
    if (content.Registration && typeof content.Registration === "object") return content.Registration as Record<string, unknown>;
    if (Array.isArray(content.carrier) && content.carrier[0] && typeof content.carrier[0] === "object") {
      return content.carrier[0] as Record<string, unknown>;
    }
  }
  if (obj.carrier && typeof obj.carrier === "object") return obj.carrier as Record<string, unknown>;
  return null;
}

function parseMobileResult(payload: unknown): CarrierResult | null {
  const rec = extractRecordFromMobilePayload(payload);
  if (!rec) return null;

  const legalName = textOrNull(rec.legalName ?? rec.legal_name ?? rec.carrierName ?? rec.carrier_name);
  const usdot = textOrNull(rec.dotNumber ?? rec.dot_number ?? rec.usdot_number ?? rec.usdot);
  if (!legalName || !usdot) return null;

  const mc = textOrNull(rec.docketNumber ?? rec.docket_number ?? rec.mc_number ?? rec.mc);
  const authority = textOrNull(rec.brokerAuthorityStatus ?? rec.authority_status ?? rec.authorityStatus);
  const insurance = textOrNull(rec.insuranceStatus ?? rec.insurance_status);
  const safety = textOrNull(rec.safetyRating ?? rec.safety_rating);

  return {
    legal_name: legalName,
    dba_name: textOrNull(rec.dbaName ?? rec.dba_name),
    usdot_number: usdot,
    mc_number: mc,
    address: {
      line1: textOrNull(rec.phyStreet ?? rec.address_line1 ?? rec.street),
      city: textOrNull(rec.phyCity ?? rec.city),
      state: textOrNull(rec.phyState ?? rec.state),
      zip: textOrNull(rec.phyZipcode ?? rec.zip ?? rec.postal_code),
    },
    phone: textOrNull(rec.telephone ?? rec.phone),
    authority_status: normalizeAuthorityStatus(authority),
    insurance_status: insurance,
    safety_rating: safety,
    raw: payload,
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function captureAfterLabel(html: string, labels: string[]) {
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*</[^>]+>\\s*<[^>]+>([\\s\\S]*?)</`, "i");
    const match = html.match(regex);
    if (match?.[1]) {
      const val = decodeHtml(match[1]);
      if (val) return val;
    }
  }
  return null;
}

function parseSaferSnapshotHtml(html: string): CarrierResult | null {
  const plain = decodeHtml(html);
  const capturePlain = (pattern: RegExp) => {
    const match = plain.match(pattern);
    return textOrNull(match?.[1] ?? null);
  };

  const legal =
    captureAfterLabel(html, ["Legal Name", "Legal Name:"]) ??
    capturePlain(/Legal Name:\s*(.+?)\s*(?:DBA Name:|Physical Address:)/i);
  const usdot =
    captureAfterLabel(html, ["USDOT Number", "USDOT#"]) ??
    capturePlain(/USDOT Number[:\s]+(\d{5,})/i) ??
    capturePlain(/n_dotno=(\d{5,})/i);
  if (!legal || !usdot) return null;

  const address =
    captureAfterLabel(html, ["Physical Address", "Physical Address:"]) ??
    capturePlain(/Physical Address:\s*(.+?)\s*Phone:/i);
  const mcFromSnapshot = capturePlain(/MC\/MX\/FF Number\(s\):\s*MC-?(\d+)/i);
  const phone = capturePlain(/Phone:\s*(\([0-9]{3}\)\s*[0-9-]+)/i) ?? captureAfterLabel(html, ["Phone", "Telephone"]);
  const authorityStatus =
    capturePlain(/Operating Authority Status:\s*(.+?)\s*MC\/MX\/FF Number/i) ??
    captureAfterLabel(html, ["Broker Authority", "Authority Status", "Common Authority Status"]);
  const insuranceStatus =
    capturePlain(/Licensing & Insurance(?:\s*\((.+?)\))?/i) ??
    captureAfterLabel(html, ["Insurance", "BIPD Insurance", "Insurance on File"]);
  const safetyRating =
    capturePlain(/Rating:\s*(.+?)\s*Type:/i) ??
    captureAfterLabel(html, ["Safety Rating"]);
  const normalizedSafetyRating =
    safetyRating && /none/i.test(safetyRating) ? "NONE" : safetyRating;

  const normalizedAddress = address?.replace(/\s+/g, " ").trim() ?? "";
  const addressMatch = normalizedAddress.match(/^(.*?)(?:\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s+([0-9-]{5,10}))?$/);
  const line1 = textOrNull(addressMatch?.[1] ?? normalizedAddress);
  const city = textOrNull(addressMatch?.[2] ?? null);
  const state = textOrNull(addressMatch?.[3] ?? null);
  const zip = textOrNull(addressMatch?.[4] ?? null);

  return {
    legal_name: legal,
    dba_name: captureAfterLabel(html, ["DBA Name", "DBA Name:"]) ?? capturePlain(/DBA Name:\s*(.+?)\s*Physical Address:/i),
    usdot_number: usdot.replace(/[^\d]/g, ""),
    mc_number: mcFromSnapshot ?? ((captureAfterLabel(html, ["Docket Number", "MC/MX/FF Number"]) ?? "").replace(/[^0-9]/g, "") || null),
    address: {
      line1,
      city,
      state,
      zip,
    },
    phone,
    authority_status: normalizeAuthorityStatus(authorityStatus),
    insurance_status: insuranceStatus,
    safety_rating: normalizedSafetyRating,
    raw: { html },
  };
}

function classifyHttpStatus(
  status: number,
  source: "mobile" | "safer",
  retryAfterHeader: string | null
): "not_found" | "retryable" | "permanent" | "ok_continue" {
  if (status === 404) return "not_found";
  if (status === 429) return "retryable";
  if (status >= 500) return "retryable";
  if (status >= 400 && status < 500) return "permanent";
  if (!Number.isFinite(status) || status < 200 || status >= 300) {
    // Non-2xx that isn't 4xx/5xx (e.g. 3xx without follow) — treat as permanent for safety.
    void source;
    void retryAfterHeader;
    return "permanent";
  }
  return "ok_continue";
}

function throwForRetryable(status: number, source: "mobile" | "safer", retryAfterHeader: string | null): never {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  throw new FmcsaRetryableError(
    status === 429
      ? `FMCSA ${source} rate limited (429)`
      : `FMCSA ${source} service error ${status}`,
    { status, retryAfterMs }
  );
}

function throwForPermanent(status: number, source: "mobile" | "safer"): never {
  throw new FmcsaPermanentError(`FMCSA ${source} client error ${status}`, { status });
}

function wrapNetworkError(error: unknown): never {
  if (error instanceof FmcsaRetryableError || error instanceof FmcsaPermanentError) throw error;
  const message = String((error as Error)?.message ?? error);
  throw new FmcsaRetryableError(`FMCSA network failure: ${message}`, { status: null });
}

async function fetchJsonResponse(url: string, accept: string): Promise<Response> {
  try {
    return await withTimeout(fetch(url, { method: "GET", headers: { Accept: accept } }));
  } catch (error) {
    wrapNetworkError(error);
  }
}

async function fetchFmcsMobile(type: LookupType, value: string): Promise<CarrierResult | null> {
  const normalized = normalizeLookupValue(type, value);
  const route = type === "usdot" ? `/carriers/${encodeURIComponent(normalized)}` : `/carriers/docket-number/${encodeURIComponent(normalized)}`;
  const query = FMCSA_MOBILE_KEY ? `?webKey=${encodeURIComponent(FMCSA_MOBILE_KEY)}` : "";

  const response = await fetchJsonResponse(`${FMCSA_MOBILE_BASE}${route}${query}`, "application/json");

  const kind = classifyHttpStatus(response.status, "mobile", response.headers.get("retry-after"));
  if (kind === "not_found") return null;
  if (kind === "retryable") throwForRetryable(response.status, "mobile", response.headers.get("retry-after"));
  if (kind === "permanent") throwForPermanent(response.status, "mobile");

  const payload = (await response.json()) as unknown;
  return parseMobileResult(payload);
}

async function fetchSaferSnapshot(type: LookupType, value: string): Promise<CarrierResult | null> {
  const normalized = normalizeLookupValue(type, value);
  // Alternate query_param is only for authoritative miss (404 / no-record HTML).
  // Provider retryable (429 / 5xx / network) must stop this attempt immediately so
  // outbox can honor Retry-After — never hammer the alternate SAFER endpoint.
  const queryParams = type === "usdot" ? ["USDOT", "MC_MX"] : ["MC_MX", "USDOT"];

  for (const queryParam of queryParams) {
    const url = `${FMCSA_SAFER_BASE}?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=${encodeURIComponent(queryParam)}&query_string=${encodeURIComponent(normalized)}`;
    const response = await fetchJsonResponse(url, "text/html");

    const kind = classifyHttpStatus(response.status, "safer", response.headers.get("retry-after"));
    if (kind === "not_found") continue;
    if (kind === "retryable") {
      // Fail-fast: throw typed retryable with Retry-After (no alternate SAFER request).
      throwForRetryable(response.status, "safer", response.headers.get("retry-after"));
    }
    if (kind === "permanent") throwForPermanent(response.status, "safer");

    const html = await response.text();
    if (/no records found|unable to locate|record inactive/i.test(html)) continue;
    const parsed = parseSaferSnapshotHtml(html);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Dual-source precedence (mobile → SAFER):
 * 1. Either source returns carrier data → use it (mobile short-circuit; else SAFER).
 * 2. SAFER miss + mobile retryable (429/5xx/network) → throw retryable (never null).
 * 3. SAFER miss + mobile permanent (non-404 4xx) → throw permanent (never stamp not-found).
 * 4. Both authoritative misses (404 / no records) → null.
 * 5. SAFER typed error wins over a stored mobile error when SAFER itself fails.
 */
async function lookupCarrier(type: LookupType, value: string): Promise<CarrierResult | null> {
  const normalized = normalizeLookupValue(type, value);
  if (!normalized) return null;

  let mobileRetryable: FmcsaRetryableError | null = null;
  let mobilePermanent: FmcsaPermanentError | null = null;
  try {
    const mobile = await fetchFmcsMobile(type, normalized);
    if (mobile) return mobile;
  } catch (error) {
    if (error instanceof FmcsaPermanentError) {
      // Still try SAFER for an authoritative hit; preserve permanent if SAFER misses.
      mobilePermanent = error;
    } else if (error instanceof FmcsaRetryableError) {
      mobileRetryable = error;
    } else {
      wrapNetworkError(error);
    }
  }

  try {
    const safer = await fetchSaferSnapshot(type, normalized);
    if (safer) return safer;
    if (mobileRetryable) throw mobileRetryable;
    if (mobilePermanent) throw mobilePermanent;
    return null;
  } catch (error) {
    if (error instanceof FmcsaRetryableError) throw error;
    if (error instanceof FmcsaPermanentError) throw error;
    if (mobileRetryable) throw mobileRetryable;
    if (mobilePermanent) throw mobilePermanent;
    wrapNetworkError(error);
  }
}

export function lookupCarrierByUSDOT(usdot: string) {
  return lookupCarrier("usdot", usdot);
}

export function lookupCarrierByMC(mcNumber: string) {
  return lookupCarrier("mc", mcNumber);
}

export { FmcsaPermanentError, FmcsaRetryableError, parseRetryAfterMs } from "./fmcsa-http-errors.js";
