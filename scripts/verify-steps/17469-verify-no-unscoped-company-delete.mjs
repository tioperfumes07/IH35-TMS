export default {
  name: "verify:no-unscoped-company-delete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-unscoped-company-delete.mjs"]);
  },
};
