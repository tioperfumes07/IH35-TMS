export default {
  name: "verify:unit-permit-archive-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-permit-archive-company-lifecycle.mjs"]);
  },
};
