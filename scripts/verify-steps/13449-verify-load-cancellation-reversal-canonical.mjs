export default {
  name: "verify:load-cancellation-reversal-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-cancellation-reversal-canonical.mjs"]);
  },
};
