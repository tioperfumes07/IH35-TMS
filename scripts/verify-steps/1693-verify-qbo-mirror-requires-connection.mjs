/** No QBO connection ⇒ no QBO mirror rows. Would have caught the 2026-06-25 cross-entity leak. */
export default {
  name: "verify-qbo-mirror-requires-connection",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-mirror-requires-connection.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-mirror-requires-connection.mjs"]);
  },
};
