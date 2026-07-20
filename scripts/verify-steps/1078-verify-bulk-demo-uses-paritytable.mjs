export default {
  name: "verify:bulk-demo-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-demo-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bulk-demo-uses-paritytable.mjs"]);
  },
};
