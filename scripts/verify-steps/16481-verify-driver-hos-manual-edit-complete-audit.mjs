export default {
  name: "verify:driver-hos-manual-edit-complete-audit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hos-manual-edit-complete-audit.mjs"]);
  },
};
