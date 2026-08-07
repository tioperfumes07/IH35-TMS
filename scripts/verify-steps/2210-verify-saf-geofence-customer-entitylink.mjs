export default {
  name: "verify-saf-geofence-customer-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-geofence-customer-entitylink.mjs"]);
  },
};
