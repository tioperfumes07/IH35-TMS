type SupportedCompany = "TRK" | "TRANSP";

type QboEnv = "sandbox" | "production";

type QueryResult<T> = {
  QueryResponse?: {
    [key: string]: T[] | number | undefined;
  };
  time?: string;
};

export type QboApiContext = {
  operatingCompanyId: string;
  companyCode: SupportedCompany;
  realmId: string;
};

type QboTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const TOKENS = new Map<string, QboTokenSet>();

const DEFAULT_PAGE_SIZE = 100;
const MAX_RETRIES = 5;

function qboEnv(): QboEnv {
  const env = (process.env.QBO_ENV ?? "production").toLowerCase();
  return env === "sandbox" ? "sandbox" : "production";
}

function qboApiBase() {
  return qboEnv() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

function qboOauthTokenBase() {
  return qboEnv() === "sandbox"
    ? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    : "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

function companyConfig(companyCode: SupportedCompany) {
  if (companyCode === "TRK") {
    return {
      realmId: (process.env.QBO_REALM_ID_TRK ?? "").trim(),
      refreshToken: (process.env.QBO_REFRESH_TOKEN_TRK ?? "").trim(),
    };
  }
  return {
    realmId: (process.env.QBO_REALM_ID_TRANSP ?? "").trim(),
    refreshToken: (process.env.QBO_REFRESH_TOKEN_TRANSP ?? "").trim(),
  };
}

function redactHeaders(headers: Record<string, string>) {
  const cloned = { ...headers };
  if (cloned.Authorization) cloned.Authorization = "Bearer [REDACTED]";
  return cloned;
}

function assertQboCredentials(companyCode: SupportedCompany) {
  const clientId = (process.env.QBO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.QBO_CLIENT_SECRET ?? "").trim();
  const company = companyConfig(companyCode);
  if (!clientId || !clientSecret) throw new Error("QBO_CLIENT_ID/QBO_CLIENT_SECRET missing");
  if (!company.realmId) throw new Error(`QBO realm ID missing for ${companyCode}`);
  if (!company.refreshToken) throw new Error(`QBO refresh token missing for ${companyCode}`);
  return {
    clientId,
    clientSecret,
    realmId: company.realmId,
    refreshToken: company.refreshToken,
  };
}

async function refreshAccessToken(companyCode: SupportedCompany) {
  const creds = assertQboCredentials(companyCode);
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
  });

  const response = await fetch(qboOauthTokenBase(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(`QBO token refresh failed for ${companyCode}`);
  }

  const tokenSet: QboTokenSet = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || creds.refreshToken,
    expiresAt: Date.now() + Math.max(30, Number(payload.expires_in ?? 3600) - 60) * 1000,
  };
  TOKENS.set(companyCode, tokenSet);
  return { tokenSet, realmId: creds.realmId };
}

async function ensureAccessToken(companyCode: SupportedCompany) {
  const cached = TOKENS.get(companyCode);
  if (cached && cached.expiresAt > Date.now()) {
    const realmId = companyConfig(companyCode).realmId;
    return { accessToken: cached.accessToken, realmId };
  }
  const refreshed = await refreshAccessToken(companyCode);
  return { accessToken: refreshed.tokenSet.accessToken, realmId: refreshed.realmId };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init: RequestInit, retries = 0): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status === 429 && retries < MAX_RETRIES) {
    const waitMs = Math.min(30_000, 500 * 2 ** retries);
    await sleep(waitMs);
    return requestWithRetry(url, init, retries + 1);
  }
  if (response.status >= 500 && retries < MAX_RETRIES) {
    const waitMs = Math.min(10_000, 300 * 2 ** retries);
    await sleep(waitMs);
    return requestWithRetry(url, init, retries + 1);
  }
  return response;
}

export async function qboQuery<T = Record<string, unknown>>(ctx: QboApiContext, query: string) {
  const { accessToken } = await ensureAccessToken(ctx.companyCode);
  const url = `${qboApiBase()}/${ctx.realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ url, headers: redactHeaders(headers) }, "QBO query");
  const response = await requestWithRetry(url, { method: "GET", headers });
  const payload = (await response.json()) as QueryResult<T>;
  if (!response.ok) throw new Error(`QBO query failed: status=${response.status}`);
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
  const { accessToken } = await ensureAccessToken(ctx.companyCode);
  const url = `${qboApiBase()}/${ctx.realmId}/${entityName}/${encodeURIComponent(id)}?minorversion=75`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ url, headers: redactHeaders(headers) }, "QBO get by id");
  const response = await requestWithRetry(url, { method: "GET", headers });
  const payload = (await response.json()) as T;
  if (!response.ok) throw new Error(`QBO get entity failed: status=${response.status}`);
  return payload;
}

export async function qboDownloadAttachment(ctx: QboApiContext, downloadUrl: string) {
  const { accessToken } = await ensureAccessToken(ctx.companyCode);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  console.info({ downloadUrl, headers: redactHeaders(headers) }, "QBO attachment download");
  const response = await requestWithRetry(downloadUrl, { method: "GET", headers });
  if (!response.ok) throw new Error(`QBO attachment download failed: status=${response.status}`);
  const contentType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  return { data: Buffer.from(arrayBuffer), contentType };
}

export async function qboPaginateEntity<T = Record<string, unknown>>(
  ctx: QboApiContext,
  entityName: string,
  whereClause = ""
) {
  const rows: T[] = [];
  let start = 1;
  while (true) {
    const payload = await qboListEntity<T>(ctx, entityName, whereClause, start, DEFAULT_PAGE_SIZE);
    const list = (payload.QueryResponse?.[entityName] as T[] | undefined) ?? [];
    rows.push(...list);
    if (list.length < DEFAULT_PAGE_SIZE) break;
    start += DEFAULT_PAGE_SIZE;
  }
  return rows;
}

export function qboCompanyContext(operatingCompanyId: string, companyCode: SupportedCompany): QboApiContext {
  const config = companyConfig(companyCode);
  if (!config.realmId) throw new Error(`QBO_REALM_ID missing for ${companyCode}`);
  return {
    operatingCompanyId,
    companyCode,
    realmId: config.realmId,
  };
}

