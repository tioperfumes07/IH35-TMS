export default {
  name: "verify:pending-approvals-gl-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pending-approvals-gl-linkage.mjs"]);
  },
};
