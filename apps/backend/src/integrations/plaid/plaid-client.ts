import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

type PlaidEnv = "sandbox" | "development" | "production";

let cachedClient: PlaidApi | null = null;
let initializedEnv: PlaidEnv | null = null;

function resolvePlaidEnv(): PlaidEnv {
  const envRaw = (process.env.PLAID_ENV ?? "").trim().toLowerCase();
  if (!envRaw) {
    throw new Error("PLAID_ENV is required (sandbox|development|production)");
  }
  if (envRaw !== "sandbox" && envRaw !== "development" && envRaw !== "production") {
    throw new Error(`Unsupported PLAID_ENV value: ${envRaw}`);
  }
  return envRaw;
}

function resolveBasePath(env: PlaidEnv) {
  if (env === "production") return PlaidEnvironments.production;
  if (env === "development") return PlaidEnvironments.development;
  return PlaidEnvironments.sandbox;
}

export function getPlaidClient() {
  if (cachedClient) return cachedClient;

  const clientId = (process.env.PLAID_CLIENT_ID ?? "").trim();
  const secret = (process.env.PLAID_SECRET ?? "").trim();
  if (!clientId) throw new Error("PLAID_CLIENT_ID is required");
  if (!secret) throw new Error("PLAID_SECRET is required");

  const env = resolvePlaidEnv();
  const config = new Configuration({
    basePath: resolveBasePath(env),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  cachedClient = new PlaidApi(config);
  initializedEnv = env;
  console.info(`Plaid client initialized: env=${env}`);
  return cachedClient;
}

export function getPlaidEnvForAudit() {
  return initializedEnv ?? resolvePlaidEnv();
}

