// Step 1834 — Relay fuel driver match is integration_id ONLY (phone/name fallbacks removed 2026-10-03) + rematch route.
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-relay-fuel-driver-match-fallbacks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-relay-fuel-driver-match-fallbacks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-fuel-driver-match-fallbacks.mjs"]);
    // RELAY-F441 orphan-guard wiring (Devin-A batch-23)
    await ctx.run("node", ["scripts/verify-relay-fuel-items-parsed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-fuel-items-parsed.mjs"]);
  },
};
