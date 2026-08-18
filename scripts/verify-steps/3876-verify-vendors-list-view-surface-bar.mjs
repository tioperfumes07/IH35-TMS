export default {
  name: "verify:vendors-list-view-surface-bar",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-list-view-surface-bar.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendors-list-view-surface-bar.mjs"]);
  },
};
