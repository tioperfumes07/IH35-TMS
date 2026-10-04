export default {
  name: "verify:edit-vehicle-modal-rbac-fields",
  run(ctx) {
    ctx.run("node", ["scripts/verify-edit-vehicle-modal-rbac-fields.mjs"]);
  },
};
