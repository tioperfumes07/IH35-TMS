export default {
  name: "verify:unit-plate-edit-active-company-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-plate-edit-active-company-cas.mjs"]);
  },
};
