import { getValidAccessToken } from "./qbo-oauth.service.js";

type QboEnv = "sandbox" | "production";

type QueryResult<T> = {
  QueryResponse?: {
    [key: string]: T[] | number | undefined;
  };
  time?: string;
};

export type QboApiContext = {
  operatingCompanyId: string;
  realmId: string;
  onRetry?: (details: { status: number; attempt: number; delay_ms: number; url: string }) => void | Promise<void>;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

function qboEnv(): QboEnv {
  const env = (process.env.QBO_ENV ?? "production").toLowerCase();
  return env === "sandbox" ? "sandbox" : "production";
}

function qboApiBase() {
  return qboEnv() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

function redactHeaders(headers: Record<string, string>) {
  const cloned = { ...headers };
  if (cloned.Authorization) cloned.Authorization = "Bearer [REDACTED]";
  return cloned;
}

async function ensureAccessToken(ctx: QboApiContext) {
  const tokenSet = await getValidAccessToken(ctx.operatingCompanyId);
  return { accessToken: tokenSet.access_token, realmId: tokenSet.realm_id };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  onRetry?: (details: { status: number; attempt: number; delay_ms: number; url: string }) => void | Promise<void>
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, init);
    const retryable = response.status === 429 || response.status === 503;
    if (!retryable || attempt === MAX_RETRIES) return response;

    const retryAfterSeconds = Number.parseInt(response.headers.get("retry-after") ?? "0", 10);
    const delayMs = Math.max(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 0, RETRY_DELAYS_MS[attempt] ?? 16000);
    await onRetry?.({ status: response.status, attempt: attempt + 1, delay_ms: delayMs, url });
    await sleep(delayMs);
  }

  return fetch(url, init);
}

function sanitizeBodyPreview(text: string) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 500);
}

export async function qboQuery<T = Record<string, unknown>>(ctx: QboApiContext, query: string) {
  const { accessToken, realmId } = await ensureAccessToken(ctx);
  const url = `${qboApiBase()}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ url, headers: redactHeaders(headers) }, "QBO query");
  const response = await requestWithRetry(url, { method: "GET", headers }, ctx.onRetry);
  const responseText = await response.text();
  if (!response.ok) {
    const preview = sanitizeBodyPreview(responseText);
    console.error({ url, status: response.status, bodyPreview: preview }, "QBO query failed");
    throw new Error(`QBO query failed: status=${response.status}; body=${preview}`);
  }
  const payload = JSON.parse(responseText) as QueryResult<T>;
  return payload;
}

export async function qboListEntity<T = Record<string, unknown>>(
  ctx: QboApiContext,
  entityName: string,
  whereClause = "",
  startPosition = 1,
  maxResults = DEFAULT_PAGE_SIZE
) {
  const whereSql = whereClause ? ` WHERE ${whereClause}` : "";
  const query = `SELECT * FROM ${entityName}${whereSql} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
  return qboQuery<T>(ctx, query);
}

export async function qboGetEntityById<T = Record<string, unknown>>(ctx: QboApiContext, entityName: string, id: string) {
  const { accessToken, realmId } = await ensureAccessToken(ctx);
  const url = `${qboApiBase()}/${realmId}/${entityName}/${encodeURIComponent(id)}?minorversion=75`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ url, headers: redactHeaders(headers) }, "QBO get by id");
  const response = await requestWithRetry(url, { method: "GET", headers }, ctx.onRetry);
  const responseText = await response.text();
  if (!response.ok) {
    const preview = sanitizeBodyPreview(responseText);
    console.error({ url, status: response.status, bodyPreview: preview }, "QBO get by id failed");
    throw new Error(`QBO get entity failed: status=${response.status}; body=${preview}`);
  }
  const payload = JSON.parse(responseText) as T;
  return payload;
}

export async function qboDownloadAttachment(ctx: QboApiContext, downloadUrl: string) {
  const { accessToken } = await ensureAccessToken(ctx);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ downloadUrl, headers: redactHeaders(headers) }, "QBO attachment download");
  const response = await requestWithRetry(downloadUrl, { method: "GET", headers }, ctx.onRetry);
  if (!response.ok) {
    const bodyPreview = sanitizeBodyPreview(await response.text());
    console.error({ downloadUrl, status: response.status, bodyPreview }, "QBO attachment download failed");
    throw new Error(`QBO attachment download failed: status=${response.status}; body=${bodyPreview}`);
  }
  const contentType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  return { data: Buffer.from(arrayBuffer), contentType };
}

export async function* qboPaginateEntity<T = Record<string, unknown>>(
  ctx: QboApiContext,
  entityName: string,
  whereClause = "",
  opts?: { pageSize?: number }
): AsyncGenerator<T[], void, unknown> {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  let start = 1;
  while (true) {
    const payload = await qboListEntity<T>(ctx, entityName, whereClause, start, pageSize);
    const page = (payload.QueryResponse?.[entityName] as T[] | undefined) ?? [];
    if (page.length === 0) break;
    yield page;
    if (page.length < pageSize) break;
    start += pageSize;
  }
}

export async function qboCompanyContext(operatingCompanyId: string): Promise<QboApiContext> {
  const tokenSet = await getValidAccessToken(operatingCompanyId);
  return {
    operatingCompanyId,
    realmId: tokenSet.realm_id,
  };
}

