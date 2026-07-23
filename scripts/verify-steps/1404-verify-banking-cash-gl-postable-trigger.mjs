export default {
  name: "verify-banking-cash-gl-postable-trigger",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-banking-cash-gl-postable-trigger.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-cash-gl-postable-trigger.mjs"]);
  },
};
