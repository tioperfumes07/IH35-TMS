export default {
  name: "verify:reversal-symmetry",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reversal-symmetry.mjs"]);
  },
};
