export default {
  name: "verify:safety-incident-list-filters",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-incident-list-filters.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-incident-list-filters.mjs"]);
  },
};
