// 1614 — P0 WORKORDER: branch-rebuild-linear must never revert later merges via two-dot vs main.
export default {
  name: "verify-rebuild-linear-no-revert",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-rebuild-linear-no-revert.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-rebuild-linear-no-revert.mjs"]);
  },
};
