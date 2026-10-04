export default {
  name: "verify:settlement-dispute-je-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-dispute-je-gate.mjs"]);
  },
};
