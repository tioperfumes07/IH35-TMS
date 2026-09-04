export default {
  name: "verify-load-costs-on-time-requires-appointment",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-on-time-requires-appointment.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-on-time-requires-appointment.mjs"]);
  },
};
