export default {
  name: "verify:paritytable-group-bands",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-group-bands.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-group-bands.mjs"]);
  },
};
