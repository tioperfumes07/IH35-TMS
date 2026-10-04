export default {
  name: "verify:hos-violation-void-reason",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-violation-void-reason.mjs"]);
  },
};
