// Allow Vitest to import backend modules that eagerly validate env (matches local CI Postgres defaults).
process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/ih35_test";
process.env.DATABASE_DIRECT_URL ??= process.env.DATABASE_URL;

// Lucia OAuth env is validated at import time — provide harmless defaults for tests.
process.env.OAUTH_GOOGLE_CLIENT_ID ??= "vitest-google-client-id";
process.env.OAUTH_GOOGLE_CLIENT_SECRET ??= "vitest-google-client-secret";
process.env.OAUTH_REDIRECT_URI ??= "http://localhost:5173/api/v1/auth/google/callback";

process.env.NODE_ENV ??= "test";
process.env.IH35_TEST_AUTH_BYPASS = "1";
process.env.ENABLE_OUTBOX_PROCESSOR ??= "false";
