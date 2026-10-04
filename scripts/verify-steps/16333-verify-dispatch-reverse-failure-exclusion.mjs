export default {
  name: "verify:dispatch-reverse-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-reverse-failure-exclusion.mjs"]);
  },
};
