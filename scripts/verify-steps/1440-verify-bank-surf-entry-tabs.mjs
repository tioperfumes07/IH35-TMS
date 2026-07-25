export default {
  name: "verify-bank-surf-entry-tabs",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bank-surf-entry-tabs.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-surf-entry-tabs.mjs"]);
  },
};
