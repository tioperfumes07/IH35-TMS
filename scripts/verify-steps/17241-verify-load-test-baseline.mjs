export default {
  name: "verify:load-test-baseline",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-test-baseline.mjs"]);
  },
};
