export default {
  name: "verify:driver-escrow-separation-90day-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-escrow-separation-90day-gate.mjs"]);
  },
};
