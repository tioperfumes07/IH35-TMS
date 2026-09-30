/**
 * ROUND 297.3 (Lead order): "a recommendation that ships without its evidence fields fails the
 * build" — B-27's own version: attribution that isn't time-boxed, or MPG computed through an
 * odometer gap, fails the build. Verify-step 11959, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-driver-attribution-is-time-boxed",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-attribution-is-time-boxed.mjs"]);
  },
};
