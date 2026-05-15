import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import { withLuciaBypass } from "../auth/db.js";

export type AdminDeepHealthCheck = {
  name: string;
  ok: boolean;
  tier: "critical" | "non_critical";
  duration_ms: number;
  skipped?: boolean;
  error?: string;
};

export async function promiseTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

function r2Bucket(): string {
  return process.env.R2_BUCKET_NAME?.trim() || process.env.R2_BUCKET?.trim() || "ih35-tms-evidence";
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim()
  );
}

function resolvePlaidSandboxCredentials(): { clientId: string; secret: string } | null {
  const env = (process.env.PLAID_ENV ?? "").trim().toLowerCase();
  const clientId =
    (process.env.PLAID_SANDBOX_CLIENT_ID ?? "").trim() || (env === "sandbox" ? (process.env.PLAID_CLIENT_ID ?? "").trim() : "");
  const secret =
    (process.env.PLAID_SANDBOX_SECRET ?? "").trim() || (env === "sandbox" ? (process.env.PLAID_SECRET ?? "").trim() : "");
  if (!clientId || !secret) return null;
  return { clientId, secret };
}

function resolveQboRealmAndToken(): { realmId: string; accessToken: string } | null {
  const realmId =
    (process.env.QBO_DEFAULT_REALM_ID ?? "").trim() ||
    (process.env.QBO_REALM_ID ?? "").trim() ||
    (process.env.INTUIT_REALM_ID ?? "").trim();
  const accessToken = (process.env.QBO_ACCESS_TOKEN ?? "").trim();
  if (!realmId || !accessToken) return null;
  return { realmId, accessToken };
}

async function timedProbe(name: string, tier: AdminDeepHealthCheck["tier"], ms: number, fn: () => Promise<void>): Promise<AdminDeepHealthCheck> {
  const started = Date.now();
  try {
    await promiseTimeout(fn(), ms);
    return { name, ok: true, tier, duration_ms: Date.now() - started };
  } catch (error) {
    return {
      name,
      ok: false,
      tier,
      duration_ms: Date.now() - started,
      error: String((error as Error)?.message ?? error),
    };
  }
}

async function probePostgresSelect1(): Promise<void> {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT 1 AS ok`);
  });
}

async function probeRedisPing(): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error("missing_redis_url");
  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  try {
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

async function probeR2HeadBucket(): Promise<void> {
  if (!r2Configured()) throw new Error("r2_not_configured");
  const accountId = process.env.R2_ACCOUNT_ID as string;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string;
  const bucket = r2Bucket();

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

async function probePlaidSandboxPublicToken(): Promise<void> {
  const creds = resolvePlaidSandboxCredentials();
  if (!creds) throw new Error("plaid_sandbox_credentials_missing");

  const res = await fetch(`https://sandbox.plaid.com/sandbox/public_token/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      secret: creds.secret,
      institution_id: "ins_109508",
      initial_products: ["transactions"],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`plaid_sandbox_public_token_http_${res.status}:${text.slice(0, 240)}`);
  }
}

async function probeQboCompanyInfo(): Promise<void> {
  const ctx = resolveQboRealmAndToken();
  if (!ctx) throw new Error("qbo_credentials_missing");

  const url = `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(ctx.realmId)}/companyinfo/${encodeURIComponent(ctx.realmId)}?minorversion=65`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ctx.accessToken}`,
    },
  });

  if (res.status === 401) {
    throw new Error("qbo_token_expired_or_invalid");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`qbo_companyinfo_http_${res.status}:${text.slice(0, 240)}`);
  }
}

async function probeQboCompanyInfoCheck(): Promise<AdminDeepHealthCheck> {
  const started = Date.now();
  const ctx = resolveQboRealmAndToken();
  if (!ctx) {
    return {
      name: "qbo.companyinfo",
      ok: true,
      tier: "non_critical",
      duration_ms: Date.now() - started,
      skipped: true,
      error: "skipped_missing_qbo_credentials",
    };
  }

  try {
    await promiseTimeout(probeQboCompanyInfo(), 5000);
    return { name: "qbo.companyinfo", ok: true, tier: "non_critical", duration_ms: Date.now() - started };
  } catch (error) {
    const msg = String((error as Error)?.message ?? error);
    if (msg.includes("qbo_token_expired_or_invalid")) {
      return {
        name: "qbo.companyinfo",
        ok: true,
        tier: "non_critical",
        duration_ms: Date.now() - started,
        skipped: true,
        error: "skipped_expired_or_invalid_token",
      };
    }
    return {
      name: "qbo.companyinfo",
      ok: false,
      tier: "non_critical",
      duration_ms: Date.now() - started,
      error: msg,
    };
  }
}

export async function runAdminDeepHealthProbe(): Promise<{ checks: AdminDeepHealthCheck[]; total_ms: number }> {
  const wallStart = Date.now();

  const plaidCreds = resolvePlaidSandboxCredentials();

  const [postgres, redis, r2, plaid, qbo] = await Promise.all([
    timedProbe("postgres.select1", "critical", 2000, probePostgresSelect1),
    timedProbe("redis.ping", "critical", 1000, probeRedisPing),
    timedProbe("r2.head_bucket", "non_critical", 3000, probeR2HeadBucket),
    plaidCreds
      ? timedProbe("plaid.sandbox.public_token.create", "non_critical", 5000, probePlaidSandboxPublicToken)
      : Promise.resolve({
          name: "plaid.sandbox.public_token.create",
          ok: true,
          tier: "non_critical" as const,
          duration_ms: 0,
          skipped: true,
          error: "skipped_missing_plaid_sandbox_credentials",
        }),
    probeQboCompanyInfoCheck(),
  ]);

  const checks = [postgres, redis, r2, plaid, qbo];
  return { checks, total_ms: Date.now() - wallStart };
}
