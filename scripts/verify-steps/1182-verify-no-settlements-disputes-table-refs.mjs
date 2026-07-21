export default {
  name: "verify:no-settlements-disputes-table-refs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-settlements-disputes-table-refs.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-settlements-disputes-table-refs.mjs"]);
  },
};
