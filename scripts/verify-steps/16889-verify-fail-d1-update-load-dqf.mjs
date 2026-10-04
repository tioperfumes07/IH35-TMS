export default {
  name: "verify:fail-d1-update-load-dqf",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fail-d1-update-load-dqf.mjs"]);
  },
};
