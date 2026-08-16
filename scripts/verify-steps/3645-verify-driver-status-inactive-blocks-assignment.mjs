export default {
  name: "verify-driver-status-inactive-blocks-assignment",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-status-inactive-blocks-assignment.mjs"]);
  },
};
