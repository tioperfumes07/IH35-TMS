export default {
  name: "verify:paritytable-controlled-expansion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-controlled-expansion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-controlled-expansion.mjs"]);
  },
};
