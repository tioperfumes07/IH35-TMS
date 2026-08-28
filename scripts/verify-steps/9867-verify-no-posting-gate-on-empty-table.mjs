export default {
  name: "verify:no-posting-gate-on-empty-table",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-posting-gate-on-empty-table.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-posting-gate-on-empty-table.mjs"]);
  },
};
