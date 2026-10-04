export default {
  name: "verify:cash-advance-maker-checker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-advance-maker-checker.mjs"]);
  },
};
