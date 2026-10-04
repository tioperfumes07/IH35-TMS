export default {
  name: "verify:deep-audit-a-driver-edit-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deep-audit-a-driver-edit-modal.mjs"]);
  },
};
