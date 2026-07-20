export default {
  name: "verify:launch-toggles-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-launch-toggles-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-launch-toggles-uses-paritytable.mjs"]);
  },
};
