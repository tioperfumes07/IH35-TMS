export default {
  name: "verify:admin-activity-log-reads-url-filters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-admin-activity-log-reads-url-filters.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-admin-activity-log-reads-url-filters.mjs"]);
  },
};
