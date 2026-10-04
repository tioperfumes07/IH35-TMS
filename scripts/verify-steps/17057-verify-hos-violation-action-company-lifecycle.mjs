export default {
  name: "verify:hos-violation-action-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hos-violation-action-company-lifecycle.mjs"]);
  },
};
