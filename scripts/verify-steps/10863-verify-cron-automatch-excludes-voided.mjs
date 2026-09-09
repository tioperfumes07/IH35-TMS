export default {
  name: "verify-cron-automatch-excludes-voided",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cron-automatch-excludes-voided.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cron-automatch-excludes-voided.mjs"]);
  },
};
