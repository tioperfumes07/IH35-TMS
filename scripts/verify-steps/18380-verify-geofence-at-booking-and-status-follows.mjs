/**
 * 443.140 — wire orphan scripts/verify-geofence-at-booking-and-status-follows.mjs
 * into CI via verify-steps (Rule 37 claim 18380 already on main #26740).
 * Clears locked-guards-heavy / verify:guard-wired orphan for G11 + AJK-03.
 */
export default {
  name: "verify-geofence-at-booking-and-status-follows",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-geofence-at-booking-and-status-follows.mjs", "--selftest"]);
  },
};
