// Allow Vitest to import backend modules that eagerly validate env (matches local CI Postgres defaults).
process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/ih35_test";
process.env.DATABASE_DIRECT_URL ??= process.env.DATABASE_URL;

// Lucia OAuth env is validated at import time — provide harmless defaults for tests.
process.env.OAUTH_GOOGLE_CLIENT_ID ??= "vitest-google-client-id";
process.env.OAUTH_GOOGLE_CLIENT_SECRET ??= "vitest-google-client-secret";
process.env.OAUTH_REDIRECT_URI ??= "http://localhost:5173/api/v1/auth/google/callback";

// A VITEST RUN IS NEVER A PRODUCTION RUNTIME — force it, do not defer to the ambient value.
//
// This was `??=`, which only assigns when NODE_ENV is unset. On a machine that exports
// NODE_ENV=production in the login shell (measured on the owner's Mac, 2026-09-30:
// `echo $NODE_ENV` -> production), every local vitest run inherited it. The effect was not a
// clean failure either: session-middleware's boot assertion refuses to start when
// IH35_TEST_AUTH_BYPASS=1 meets NODE_ENV=production, so createIntegrationApp() threw, the suite
// reported the auth-gate tests as 401-instead-of-400 or skipped, and the real cause -- an
// environment variable from the developer's shell -- never appeared in the output.
//
// A suite whose result depends on whoever is running it is not evidence. Tests that genuinely
// need production semantics set NODE_ENV themselves inside the test (see required-env.test.ts,
// relay-client.test.ts, driver-jwt-env-guard.test.ts) and are unaffected by this line.
process.env.NODE_ENV = "test";
process.env.IH35_TEST_AUTH_BYPASS = "1";
process.env.ENABLE_OUTBOX_PROCESSOR ??= "false";
process.env.DRIVER_JWT_SECRET ??= "vitest-driver-jwt-secret";
