/** Cursor EVEN · claim 9896 on origin/main · verify-declared-is-rendered */
export default {
  name: "verify-declared-is-rendered",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-declared-is-rendered.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-declared-is-rendered.mjs"]);
    await ctx.run("node", ["scripts/ops/build-verifier-rollup.mjs", "--check"]);
    await ctx.run("node", ["scripts/verify-derived-artifact-freshness.mjs", "--selftest"]);
    // ROUND 389 design (scripts/verify-derived-artifact-freshness.mjs, "strict is EXPLICIT"): a credential-gated
    // artifact (requiresDatabase — scripts/canonical-relations.json is generated from PROD's live schema) is proven
    // ONLY by the live job (.github/workflows/ci.yml "Derived artifact freshness — strict", PROD_READONLY_DATABASE_URL,
    // --strict, hard-fails without the secret). Here DATABASE_URL is the fresh CI database, which by construction
    // lacks prod-only relations and carries HELD migrations (.held-migrations.json), so regenerating from it is the
    // wrong source and reads as STALE. 443.101: run this non-strict pass without the CI DB credential so the gated
    // entry is reported UNVERIFIABLE HERE (named, loud), exactly as the design states; every other artifact is still
    // regenerated and diffed.
    const { DATABASE_URL: _ciDb, DATABASE_DIRECT_URL: _ciDirect, ...noCiDbEnv } = process.env;
    await ctx.run("node", ["scripts/verify-derived-artifact-freshness.mjs"], { env: noCiDbEnv });
  },
};
