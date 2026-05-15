/**
 * Plaid: retroactively set webhook URL on existing Items (Block H — P7-PLAID-ITEM-WEBHOOK-RETROACTIVE).
 *
 * Env:
 * - DATABASE_URL or DATABASE_DIRECT_URL
 * - PLAID_ENV (sandbox|development|production)
 * - PLAID_CLIENT_ID, PLAID_SECRET
 * - PLAID_WEBHOOK_URL (optional; defaults to production banking webhook)
 */

import pg from "pg";
import { PlaidEnvironments } from "plaid";

const WEBHOOK_URL =
  process.env.PLAID_WEBHOOK_URL?.trim() || "https://api.ih35dispatch.com/api/v1/banking/plaid/webhook";

function resolveBaseUrl(): string {
  const envRaw = (process.env.PLAID_ENV ?? "").trim().toLowerCase();
  if (envRaw === "production") return PlaidEnvironments.production;
  if (envRaw === "development") return PlaidEnvironments.development;
  if (envRaw === "sandbox") return PlaidEnvironments.sandbox;
  throw new Error("PLAID_ENV is required (sandbox|development|production)");
}

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 10) return "****";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

async function plaidPost<T extends Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) throw new Error("PLAID_CLIENT_ID and PLAID_SECRET are required");

  const url = `${resolveBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  });
  const json = (await res.json()) as T & { error_message?: string };
  if (!res.ok) {
    const msg = typeof json.error_message === "string" ? json.error_message : JSON.stringify(json);
    throw new Error(`plaid_http_${res.status}:${msg}`);
  }
  return json;
}

async function main() {
  const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");

  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query("SET ROLE ih35_app");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const tokensRes = await client.query<{ plaid_access_token: string }>(
      `
        SELECT DISTINCT plaid_access_token
        FROM banking.bank_accounts
        WHERE plaid_access_token IS NOT NULL
          AND btrim(plaid_access_token) <> ''
      `
    );

    const tokens = tokensRes.rows.map((row) => String(row.plaid_access_token)).filter(Boolean);
    if (!tokens.length) {
      console.log("[plaid:backfill-webhook] no Plaid-linked bank accounts found — nothing to do");
      return;
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const access_token of tokens) {
      try {
        const itemResp = await plaidPost<{ item?: { webhook?: string | null } }>("/item/get", { access_token });
        const current = String(itemResp.item?.webhook ?? "").trim();
        if (current === WEBHOOK_URL) {
          skipped += 1;
          console.log(`[plaid:backfill-webhook] skip (webhook already matches) token=${maskToken(access_token)}`);
          continue;
        }

        await plaidPost("/item/webhook/update", { access_token, webhook: WEBHOOK_URL });
        updated += 1;
        console.log(`[plaid:backfill-webhook] updated webhook token=${maskToken(access_token)}`);
      } catch (err) {
        failed += 1;
        console.error(`[plaid:backfill-webhook] FAILED token=${maskToken(access_token)}`, err);
      }
    }

    console.log(`[plaid:backfill-webhook] summary updated=${updated} skipped=${skipped} failed=${failed}`);
    if (failed > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error("[plaid:backfill-webhook] fatal:", error);
  process.exit(1);
});
