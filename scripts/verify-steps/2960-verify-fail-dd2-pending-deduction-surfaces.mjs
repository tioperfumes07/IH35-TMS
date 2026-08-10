export default {
  name: "verify:fail-dd2-pending-deduction-surfaces",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fail-dd2-pending-deduction-surfaces.mjs"]);
  },
};
