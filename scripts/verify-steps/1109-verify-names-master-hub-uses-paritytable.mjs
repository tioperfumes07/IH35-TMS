export default {
  name: "verify:names-master-hub-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-names-master-hub-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-names-master-hub-uses-paritytable.mjs"]);
  },
};
