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
    ctx.run("node", ["scripts/verify-derived-artifact-freshness.mjs"]);
  },
};
