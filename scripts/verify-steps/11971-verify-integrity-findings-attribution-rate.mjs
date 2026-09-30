/**
 * ROUND 300 B-33 (Lead order): attributed safety.integrity_findings through driverAtTimeSql.
 * This ratchets the measured resolution rate so it can't silently get worse. Verify-step 11971,
 * CC-2 band (mod-4 ≡3).
 */
export default {
  name: "verify-integrity-findings-attribution-rate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-integrity-findings-attribution-rate.mjs"]);
  },
};
