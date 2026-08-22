export default {
  name: "verify:maintenance-parts-catalog-create-modal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-parts-catalog-create-modal.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-parts-catalog-create-modal.mjs"]);
  },
};
