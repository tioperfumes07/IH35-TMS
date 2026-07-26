// 1612-verify-healthz-no-raw-error-leak — SEC-HEALTHZ-01.
//
// GET /api/v1/healthz is UNAUTHENTICATED (session-middleware.ts returns from its preHandler for
// every /api/v1/healthz url; csrf-origin-guard.ts exempts the same prefix), so its body is readable
// by anyone on the internet. It answered a failed check with the raw driver message —
// `String((error as Error)?.message ?? error)` at health.routes.ts:42 and :121 on pre-fix main —
// which for pg/ioredis/S3 carries the database host, port, database name, DB role, schema and
// relation names, and the R2 account id. Owner directive 2026-07-26: sanitize it, return a generic
// status to anonymous callers, log the real error server-side.
//
// The guard enforces the fix as a RULE, not a patch: every `error:` value published by an
// unauthenticated health route must be a DECLARED bounded code (toPublicHealthErrorCode(...), a
// "[a-z0-9_]" literal, or an ALL_CAPS constant); the sanitizer must fall back generically and never
// read .message/.stack; and every catch block that publishes a code must still log the real error.
// The audited file set is derived from the auth-exempt prefixes in session-middleware.ts, so a new
// unauthenticated health route is covered the day it is written, and an empty derivation FAILS
// rather than passing vacuously.
//
// Run against pre-fix origin/main this FAILS with 4 problems (two raw-message publishes, two
// catch blocks that never logged). The --selftest runs FIRST and is proven CAPABLE OF FAILING: it
// mutates the REAL source back into the pre-fix shape plus three neighbouring defects (interpolated
// code, message-forwarding sanitizer, removed logging), asserts each is caught and that no mutation
// was inert, asserts the shipped source is clean, and checks two benign shapes are NOT flagged.
export default {
  name: "verify-healthz-no-raw-error-leak",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-healthz-no-raw-error-leak.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-healthz-no-raw-error-leak.mjs"]);
  },
};
