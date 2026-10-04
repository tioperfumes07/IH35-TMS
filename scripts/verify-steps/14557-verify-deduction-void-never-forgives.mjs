export default {
  name: "verify:deduction-void-never-forgives",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deduction-void-never-forgives.mjs"]);
  },
};
