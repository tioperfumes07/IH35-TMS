/**
 * B-25 (Lead order, docs/bus/NOW-CC-2.md ROUND 294): "a recommendation that ships without its
 * evidence fields fails the build." Verify-step 11851, CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-fuel-geofence-recommendation-evidence",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-geofence-recommendation-evidence.mjs"]);
  },
};
