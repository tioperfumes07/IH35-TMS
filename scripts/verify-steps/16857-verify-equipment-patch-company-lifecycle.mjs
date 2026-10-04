export default {
  name: "verify:equipment-patch-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-patch-company-lifecycle.mjs"]);
  },
};
