export default {
  name: "verify-settlement-lines-load-id-backfilled",
  async run(ctx) {
    if (!process.env.DATABASE_URL) {
      console.log("verify-settlement-lines-load-id-backfilled SKIPPED -- no DATABASE_URL in this environment");
      return;
    }
    await ctx.run("node", ["scripts/verify-settlement-lines-load-id-backfilled.mjs"]);
  },
};
