export default {
  name: "verify:stop-reasoning-table-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-stop-reasoning-table-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-stop-reasoning-table-uses-paritytable.mjs"]);
  },
};
