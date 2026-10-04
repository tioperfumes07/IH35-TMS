export default {
  name: "verify:maintenance-services-catalog-editable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-services-catalog-editable.mjs"]);
  },
};
