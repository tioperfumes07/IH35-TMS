export default {
  name: "verify:cash-flow-adjustment-archive-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-adjustment-archive-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-adjustment-archive-wired.mjs"]);
  },
};
