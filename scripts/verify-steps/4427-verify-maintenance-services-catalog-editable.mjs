export default {
  name: "verify-maintenance-services-catalog-editable",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-services-catalog-editable.mjs"]) !== 0) {
      throw new Error("verify-maintenance-services-catalog-editable failed");
    }
  },
};
