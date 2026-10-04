export default {
  name: "verify:section7-palette-nonfinancial",
  run(ctx) {
    ctx.run("node", ["scripts/verify-section7-palette-nonfinancial.mjs"]);
  },
};
