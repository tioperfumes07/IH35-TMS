export default {
  name: "verify:dispatch-drug-alcohol-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-drug-alcohol-gate.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-dispatch-drug-alcohol-gate.mjs"]);
  },
};
