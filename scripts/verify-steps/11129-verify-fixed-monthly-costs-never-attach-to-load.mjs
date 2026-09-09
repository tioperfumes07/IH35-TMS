export default {
  name: "verify-fixed-monthly-costs-never-attach-to-load",
  async run(ctx) {
    if (!process.env.DATABASE_URL) {
      console.log("verify-fixed-monthly-costs-never-attach-to-load SKIPPED -- no DATABASE_URL in this environment");
      return;
    }
    await ctx.run("node", ["scripts/verify-fixed-monthly-costs-never-attach-to-load.mjs"]);
  },
};
