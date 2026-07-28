export default {
  name: "verify-money-pr-local-gate",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-money-pr-local-gate.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-money-pr-local-gate.mjs"]);
  },
};
