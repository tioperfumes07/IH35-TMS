/**
 * verify-baseline-never-grows.mjs (03e) — independent second-layer shrink-only enforcement for
 * verify-alwaystrack-parity.baseline.json (see the guard's own header for the full rationale).
 * Wired into the CI verify-step convention (verify-step 11541, CC-1 band). Claim+file landed
 * atomically in the same commit (CLAIMED-REGEN, Rule 37 registry-tooling exception) rather than a
 * two-PR round trip — the number was free and this guard's own content was already written and
 * verified earlier the same session.
 *
 * No DATABASE_URL needed — pure git+JSON diff.
 */
export default {
  name: "verify-baseline-never-grows",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-baseline-never-grows.mjs"]);
  },
};
