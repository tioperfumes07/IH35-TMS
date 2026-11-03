export default {
  name: "verify:mdata-phantom-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdata-phantom-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-mdata-phantom-columns.mjs"]);
  },
};
