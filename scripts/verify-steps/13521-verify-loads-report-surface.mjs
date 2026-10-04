export default {
  name: "verify:loads-report-surface",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loads-report-surface.mjs"]);
  },
};
