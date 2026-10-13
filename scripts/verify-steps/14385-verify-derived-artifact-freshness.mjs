// ROUND 389 (LEAD) — WIRE IT. verify-derived-artifact-freshness was authored, working, and run by NO
// workflow: its only caller was the local money-pr-local-gate. So every derived artifact's freshness was
// checked nowhere in CI, while the one credential-gated entry (scripts/canonical-relations.json) failed
// closed on every local push and blocked the whole fleet. A guard nothing runs is not a guard.
//
// No --strict here on purpose. This step runs under scripts/verify-static.mjs, which DELETES DATABASE_URL
// by design so live-prod guards cannot reach prod. Without the credential the credential-gated entry
// reports UNVERIFIABLE HERE — named, counted and printed, never silently green — and the other ten
// generators are regenerated and diffed for real. The strict run, which proves the gated one and fails if
// the read-only secret is missing, belongs in the CI job that holds secrets.PROD_READONLY_DATABASE_URL.
export default {
  name: "verify:derived-artifact-freshness",
  run(ctx) {
    // ROUND 389 design (scripts/verify-derived-artifact-freshness.mjs, "strict is EXPLICIT"): a credential-gated
    // artifact (requiresDatabase — scripts/canonical-relations.json is generated from PROD's live schema) is proven
    // ONLY by the live job (.github/workflows/ci.yml "Derived artifact freshness — strict", PROD_READONLY_DATABASE_URL,
    // --strict, hard-fails without the secret). Here DATABASE_URL is the fresh CI database, which by construction
    // lacks prod-only relations and carries HELD migrations (.held-migrations.json), so regenerating from it is the
    // wrong source and reads as STALE. 443.101: run this non-strict pass without the CI DB credential so the gated
    // entry is reported UNVERIFIABLE HERE (named, loud), exactly as the design states; every other artifact is still
    // regenerated and diffed.
    const { DATABASE_URL: _ciDb, DATABASE_DIRECT_URL: _ciDirect, ...noCiDbEnv } = process.env;
    ctx.run("node", ["scripts/verify-derived-artifact-freshness.mjs"], { env: noCiDbEnv });
  },
};
