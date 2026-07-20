export default {
  name: "verify:wo-console-list-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-console-list-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-console-list-uses-paritytable.mjs"]);
  },
};
