export default {
  name: "verify-job-cadences-derived-from-cron",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-job-cadences-derived-from-cron.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-job-cadences-derived-from-cron.mjs"]);
  },
};
