export default {
  name: "verify-booking-stop-geocode",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-booking-stop-geocode.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-booking-stop-geocode.mjs"]);
  },
};
