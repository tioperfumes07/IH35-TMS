/**
 * ROUND 31.2 — wires scripts/verify-one-canonical-active-load-set.mjs (the shrink-only ratchet
 * backstopping apps/backend/src/dispatch/canonical-active-load-set.ts) into CI. Static, no
 * DATABASE_URL needed.
 */
export default {
  name: "verify-one-canonical-active-load-set",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-one-canonical-active-load-set.mjs"]);
  },
};
