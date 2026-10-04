export default {
  name: "verify:faro-deduction-capture",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-deduction-capture.mjs"]);
  },
};
