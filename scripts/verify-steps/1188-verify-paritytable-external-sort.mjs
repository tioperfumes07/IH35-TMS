export default {
  name: "verify:paritytable-external-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-external-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-external-sort.mjs"]);
  },
};
