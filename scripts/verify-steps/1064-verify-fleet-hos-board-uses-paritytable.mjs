export default {
  name: "verify:fleet-hos-board-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-hos-board-uses-paritytable.mjs"]);
    ctx.run("node", ["scripts/verify-fleet-hos-board-uses-paritytable.mjs", "--selftest"]);
  },
};
