export default {
  name: "verify-safety-b29-audit-history-server-filters",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-safety-b29-audit-history-server-filters.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-b29-audit-history-server-filters.mjs"]);
  },
};
