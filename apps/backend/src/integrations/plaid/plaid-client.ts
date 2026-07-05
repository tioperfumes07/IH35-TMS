import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";

// Plaid retired the `development` environment (SDK exports only sandbox/production).
// Reject it (and any other unknown value) fail-loud rather than silently hitting a dead endpoint.
type PlaidEnv = "sandbox" | "production";

let cachedClient: PlaidApi | null = null;
let initializedEnv: PlaidEnv | null = null;

function resolvePlaidEnv(): PlaidEnv {
  const envRaw = (process.env.PLAID_ENV ?? "").trim().toLowerCase();
  if (!envRaw) {
    throw new Error("PLAID_ENV is required (sandbox|production)");
  }
  if (envRaw !== "sandbox" && envRaw !== "production") {
    throw new Error(
      `Unsupported PLAID_ENV value: ${envRaw} (valid: sandbox|production; 'development' was retired by Plaid)`,
    );
  }
  return envRaw;
}

function resolveBasePath(env: PlaidEnv) {
  if (env === "production") return PlaidEnvironments.production;
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

/** Wrap Plaid SDK calls with the plaid circuit breaker (BLOCK-05). */
export async function withPlaidApi<T>(fn: (client: PlaidApi) => Promise<T>): Promise<T> {
  return withCircuitBreaker("plaid", () => fn(getPlaidClient()));
}

