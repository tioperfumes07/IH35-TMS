/**
 * DEVIN-B ROUND 181.1 — wires scripts/verify-driver-samsara-map-one-to-many.mjs into CI.
 * Enforces: map table exists, UNIQUE on samsara_driver_id, no legacy column as join key,
 * backfill complete, no Samsara id maps to 2 drivers.
 */
export default {
  name: "verify-driver-samsara-map-one-to-many",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-samsara-map-one-to-many.mjs"]);
  },
};
