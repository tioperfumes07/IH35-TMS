import { qboSyncWithRetry } from "../../qbo/sync-with-retry.js";
import { getValidAccessToken } from "./qbo-oauth.service.js";

function qboApiBase() {
  const env = (process.env.QBO_ENV ?? "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    if (attempt >= maxRetries || (response.status < 500 && response.status !== 429)) return response;
    await sleep(Math.min(10_000, 400 * 2 ** attempt));
    attempt += 1;
  }
}

export async function qboPostMasterJson(
  operatingCompanyId: string,
  relativePath: string,
  body: Record<string, unknown>,
  operation: "create" | "update"
): Promise<Record<string, unknown>> {
  const value = await qboSyncWithRetry({
    operatingCompanyId,
    entityType: `qbo.master.${relativePath}`,
    operation,
    swallow_errors: false,
    replayPayload: { replay_kind: "qbo_master_write", relativePath, body },
    attempt: async () => {
      const token = await getValidAccessToken(operatingCompanyId);
      const url = `${qboApiBase()}/${token.realm_id}/${relativePath}?minorversion=75`;
      const response = await requestWithRetry(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        const err = new Error(`qbo_master_write_failed_status_${response.status}:${text.slice(0, 240)}`);
        (err as { status?: number }).status = response.status;
        (err as { bodyPreview?: string }).bodyPreview = text.slice(0, 500);
        throw err;
      }
      return JSON.parse(text) as Record<string, unknown>;
    },
  });
  if (!value) throw new Error("qbo_master_write_failed");
  return value;
}

export function unwrapIntuitEntity(response: Record<string, unknown>): Record<string, unknown> {
  const candidates = ["Vendor", "Customer", "Item", "Account"] as const;
  for (const key of candidates) {
    const row = response[key];
    if (row && typeof row === "object" && !Array.isArray(row)) return row as Record<string, unknown>;
  }
  return response;
}
