export default {
  name: "verify:qbo-bulk-link-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-bulk-link-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-bulk-link-uses-paritytable.mjs"]);
  },
};
